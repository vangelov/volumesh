import dicom from "dicom-parser";
import type { DataSet } from "dicom-parser";
import { Decoder } from "jpeg-lossless-decoder-js";
import { mat4, vec3 } from "gl-matrix";
import { meshesFromRtstruct } from "./rtstruct";
import type { Volume } from "../data/volume";
import { TarrayUtils } from "./tarray-utils";

type Slice = { ds: DataSet; position: vec3; orientation: number[]; spacing: number[]; name: string };

function numbers(ds: DataSet, tag: string, count: number): number[] {
  const values = ds.string(tag)?.split("\\").map(Number);
  if (!values || values.length !== count || values.some(v => !Number.isFinite(v))) {
    throw new Error(`Missing or invalid DICOM geometry: ${tag}`);
  }
  return values;
}

/** Import classic, single-frame CT/MR series. Geometry remains in patient LPS millimeters. */
export async function importDicomVolumes(files: File[], onProgress: (done: number, total: number) => void): Promise<Volume[]> {
  return (await importDicomData(files, onProgress)).volumes;
}

export async function importDicomData(files: File[], onProgress: (done: number, total: number) => void) {
  const series = new Map<string, Slice[]>();
  const structures: DataSet[] = [];
  const instances = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const bytes = new Uint8Array(await file.arrayBuffer());
    let ds: DataSet;
    try { ds = dicom.parseDicom(bytes); }
    catch {
      const part10 = bytes.length >= 132 && String.fromCharCode(...bytes.subarray(128, 132)) === "DICM";
      if (part10 || /\.dcm$/i.test(file.name)) throw new Error(`Cannot parse DICOM file: ${file.name}`);
      onProgress(i + 1, files.length);
      continue;
    }
    const modality = ds.string("x00080060");
    if (modality === "RTSTRUCT") structures.push(ds);
    if (modality === "CT" || modality === "MR") {
      if (Number(ds.string("x00280008") || 1) !== 1) throw new Error(`${file.name}: enhanced/multiframe DICOM is not supported yet`);
      const uid = ds.string("x0020000e");
      if (!uid) throw new Error(`${file.name}: missing Series Instance UID`);
      const instance = ds.string("x00080018");
      if (!instance || !instances.has(instance)) {
        if (instance) instances.add(instance);
        const slices = series.get(uid) || [];
        slices.push({ ds, name: file.name, position: numbers(ds, "x00200032", 3) as vec3, orientation: numbers(ds, "x00200037", 6), spacing: numbers(ds, "x00280030", 2) });
        series.set(uid, slices);
      }
    }
    onProgress(i + 1, files.length);
  }
  if (!series.size) throw new Error("No CT or MR image series found in the selected folder");
  const volumes: Volume[] = [];
  for (const slices of series.values()) {
    try { volumes.push(buildVolume(slices)); }
    catch (error) { throw new Error(`${slices[0].name}: ${error instanceof Error ? error.message : error}`); }
    // Give the UI a chance to update between series.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const { meshes, warnings, frameUID } = meshesFromRtstruct(structures, volumes);
  const compatibleVolumes = frameUID ? volumes.filter(volume => volume.dicom?.frameUID === frameUID) : volumes;
  if (compatibleVolumes.length !== volumes.length) warnings.push(`Skipped ${volumes.length - compatibleVolumes.length} volume(s) in a different Frame of Reference.`);
  return { volumes: compatibleVolumes, meshes, warnings };
}

function buildVolume(slices: Slice[]): Volume {
  const first = slices[0];
  const ds = first.ds;
  const rows = ds.uint16("x00280010") || 0;
  const cols = ds.uint16("x00280011") || 0;
  if (rows < 2 || cols < 2 || slices.length < 2) throw new Error("A volume requires at least two rows, columns and slices");
  const x = vec3.fromValues(...first.orientation.slice(0, 3) as [number, number, number]);
  const y = vec3.fromValues(...first.orientation.slice(3) as [number, number, number]);
  if (Math.abs(vec3.length(x) - 1) > 0.001 || Math.abs(vec3.length(y) - 1) > 0.001 || Math.abs(vec3.dot(x, y)) > 0.001 || first.spacing.some(v => v <= 0)) throw new Error("Invalid image orientation or pixel spacing");
  const normal = vec3.cross(vec3.create(), x, y);
  slices.sort((a, b) => vec3.dot(a.position, normal) - vec3.dot(b.position, normal));
  const origin = vec3.clone(slices[0].position);
  // Use the full displacement to preserve affine gantry tilt.
  const step = vec3.scale(vec3.create(), vec3.sub(vec3.create(), slices[slices.length - 1].position, origin), 1 / (slices.length - 1));
  if (vec3.dot(step, normal) < 0.0001) throw new Error("Duplicate slice positions or non-spatial series");
  const values = new Float32Array(rows * cols * slices.length);
  slices.forEach((slice, index) => {
    const current = slice.ds;
    if (current.uint16("x00280010") !== rows || current.uint16("x00280011") !== cols || current.string("x00200052") !== ds.string("x00200052") || current.string("x0020000d") !== ds.string("x0020000d") || slice.orientation.some((v, i) => Math.abs(v - first.orientation[i]) > 0.0001) || slice.spacing.some((v, i) => Math.abs(v - first.spacing[i]) > 0.0001)) throw new Error("Series contains inconsistent image geometry");
    const expected = vec3.scaleAndAdd(vec3.create(), origin, step, index);
    if (vec3.distance(expected, slice.position) > Math.max(0.01, vec3.length(step) * 0.001)) throw new Error("Series has missing, duplicate, or irregularly spaced slices");
    const pixels = decodePixels(current, rows * cols);
    const slope = current.floatString("x00281053") ?? 1;
    const intercept = current.floatString("x00281052") ?? 0;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) throw new Error("Invalid rescale parameters");
    for (let i = 0; i < pixels.length; i++) values[index * rows * cols + i] = pixels[i] * slope + intercept;
  });
  const data = TarrayUtils.normalizeToUint8(values, values.length);
  if (ds.string("x00280004") === "MONOCHROME1") for (let i = 0; i < data.length; i++) data[i] = 255 - data[i];
  return { dicom: { seriesUID: ds.string("x0020000e")!, frameUID: ds.string("x00200052"), instanceUIDs: slices.map(slice => slice.ds.string("x00080018") || "") }, label: `${ds.string("x00080060")} · ${ds.string("x0008103e") || "Series"} (${ds.string("x00200011") || ds.string("x0020000e")})`, origin, dims: [cols, rows, slices.length], dirs: [vec3.scale(x, x, first.spacing[1]), vec3.scale(y, y, first.spacing[0]), step], space: "lps", data, volumeToWorld: mat4.create(), worldToVolume: mat4.create() };
}

function decodePixels(ds: DataSet, count: number): Float32Array {
  const bits = ds.uint16("x00280100");
  const stored = ds.uint16("x00280101") || bits || 0;
  const high = ds.uint16("x00280102") ?? stored - 1;
  const signed = ds.uint16("x00280103") === 1;
  if ((bits !== 8 && bits !== 16) || stored < 1 || stored > bits || high < stored - 1 || high >= bits || ds.uint16("x00280002") !== 1 || !["MONOCHROME1", "MONOCHROME2"].includes(ds.string("x00280004") || "")) throw new Error("Only 8/16-bit monochrome pixels are supported");
  const element = ds.elements.x7fe00010;
  if (!element) throw new Error("Missing pixel data");
  const syntax = ds.string("x00020010") || "1.2.840.10008.1.2";
  let raw: Uint8Array;
  if (["1.2.840.10008.1.2.4.57", "1.2.840.10008.1.2.4.70"].includes(syntax)) {
    const encoded = element.basicOffsetTable?.length ? dicom.readEncapsulatedImageFrame(ds, element, 0) : dicom.readEncapsulatedPixelDataFromFragments(ds, element, 0);
    const copy = Uint8Array.from(encoded);
    const decoded = new Decoder().decode(copy.buffer, 0, copy.length, bits / 8);
    if (!decoded || decoded.length !== count) throw new Error("JPEG lossless pixel count does not match image dimensions");
    raw = new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  } else {
    if (!["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"].includes(syntax)) throw new Error(`Unsupported transfer syntax: ${syntax}`);
    raw = ds.byteArray.subarray(element.dataOffset, element.dataOffset + element.length);
  }
  if (raw.byteLength < count * bits / 8) throw new Error("Truncated pixel data");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const result = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const word = bits === 8 ? view.getUint8(i) : view.getUint16(i * 2, syntax !== "1.2.840.10008.1.2.2");
    let value = (word >>> (high + 1 - stored)) & (2 ** stored - 1);
    if (signed && value >= 2 ** (stored - 1)) value -= 2 ** stored;
    result[i] = value;
  }
  return result;
}
