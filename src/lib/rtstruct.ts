import type { DataSet } from 'dicom-parser';
import { mat4, vec3 } from 'gl-matrix';
import { Mesh } from '../data/mesh';
import type { Volume } from '../data/volume';
import { surfaceNets } from './surface-nets';

export type ReconstructionMethod = 'smooth' | 'surface-nets' | 'voxel';
export const DEFAULT_RECONSTRUCTION: ReconstructionMethod = 'smooth';

const sequence = (ds: DataSet, tag: string) => (ds.elements[tag]?.items || []).map(item => item.dataSet!);
export function decimals(ds: DataSet, tag: string, count?: number) {
  // Read the complete value field, including large DS values carried as UN.
  const element = ds.elements[tag];
  const text = element && element.dataOffset + element.length <= ds.byteArray.length
    ? new TextDecoder('ascii').decode(ds.byteArray.subarray(element.dataOffset, element.dataOffset + element.length)).replace(/[\0 ]+$/, '').trim()
    : '';
  let tokens = text ? text.split(String.fromCharCode(92)).map(token => token.trim()) : [];
  // Some exporters group each XYZ triplet with spaces or commas and separate
  // points with backslashes. Accept this only when every point has three values.
  if (tag === 'x30060050' && count !== undefined && tokens.length * 3 === count) {
    const triples = tokens.map(token => token.split(/[\s,]+/));
    if (triples.every(triple => triple.length === 3)) tokens = triples.flat();
  }
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
  const values = tokens.map(token => decimal.test(token) ? Number(token) : NaN);
  if ((count !== undefined && values.length !== count) || values.some(v => !Number.isFinite(v))) {
    const invalid = values.filter(v => !Number.isFinite(v)).length;
    throw new Error(`Invalid ${tag} (VR ${element?.vr || 'implicit'}, ${element?.length || 0} bytes): expected ${count ?? 'finite scalar'} decimal values, found ${values.length}${invalid ? ` (${invalid} are not scalar decimals)` : ''}.` +
      (tag === 'x30060050' && count !== undefined ? ` Number of Contour Points declares ${count / 3} XYZ points; each needs three coordinates.` : ''));
  }
  return values;
}

/** Generate RAS patient-space surfaces, without moving them relative to the images. */
export function meshesFromRtstruct(structures: DataSet[], volumes: Volume[], method: ReconstructionMethod = DEFAULT_RECONSTRUCTION) {
  const meshes: Mesh[] = [], warnings: string[] = [];
  const usedFrames = new Set<string>();
  for (const structure of structures) {
    const definitions = new Map(sequence(structure, 'x30060020').map(ds => [ds.string('x30060022'), ds]));
    for (const roi of sequence(structure, 'x30060039')) {
      const definition = definitions.get(roi.string('x30060084'));
      if (!definition) throw new Error('RTSTRUCT ROI is missing its structure definition');
      const label = definition.string('x30060026') || `ROI ${roi.string('x30060084')}`;
      const allContours = sequence(roi, 'x30060040');
      const contours = allContours.filter(ds => ['CLOSED_PLANAR', 'CLOSEDPLANAR_XOR'].includes(ds.string('x30060042') || ''));
      if (allContours.length !== contours.length) warnings.push(`${label}: skipped ${allContours.length - contours.length} open/point contours.`);
      if (!contours.length) continue;
      const xor = contours[0].string('x30060042') === 'CLOSEDPLANAR_XOR';
      if (contours.some(ds => (ds.string('x30060042') === 'CLOSEDPLANAR_XOR') !== xor)) throw new Error(`${label}: mixed XOR and ordinary contours`);
      const frame = definition.string('x30060024');
      const refs = contours.flatMap(ds => sequence(ds, 'x30060016')).map(ds => ds.string('x00081155'));
      const frames = sequence(structure, 'x30060010').filter(ds => ds.string('x00200052') === frame);
      const seriesRefs = frames.flatMap(ds => sequence(ds, 'x30060012')).flatMap(ds => sequence(ds, 'x30060014')).map(ds => ds.string('x0020000e'));
      const candidates = volumes.filter(volume => frame && volume.dicom?.frameUID === frame &&
        (refs.length ? refs.every(uid => !!uid && volume.dicom!.instanceUIDs.includes(uid)) :
          !seriesRefs.length || seriesRefs.includes(volume.dicom?.seriesUID)));
      if (!candidates.length) throw new Error(`${label}: include its referenced CT/MR series with matching Frame of Reference. A different frame requires a spatial registration transform.`);
      const volume = candidates[0];
      usedFrames.add(frame!);
      if (usedFrames.size > 1) throw new Error("RTSTRUCTs use different Frames of Reference; import one frame at a time or provide a spatial registration transform.");
      if (candidates.length > 1) warnings.push(`${label}: multiple series share its frame; using ${volume.label} for reconstruction.`);
      const [nx, ny, nz] = Array.from(volume.dims);
      if (nx * ny * nz > 128 * 1024 * 1024) throw new Error(`${label}: reconstruction exceeds 128 million voxels`);
      const affine = mat4.fromValues(...[
        ...volume.dirs[0], 0, ...volume.dirs[1], 0, ...volume.dirs[2], 0, ...volume.origin, 1,
      ] as Parameters<typeof mat4.fromValues>);
      const inverse = mat4.invert(mat4.create(), affine);
      if (!inverse) throw new Error(`${label}: invalid volume geometry`);
      const mask = new Uint8Array(nx * ny * nz);
      let offGrid = 0, repairedCounts = 0;
      for (const contour of contours) {
        const count = Number(contour.string('x30060046'));
        if (!Number.isInteger(count) || count < 3) throw new Error(`${label}: invalid contour point count`);
        let data: number[];
        try { data = decimals(contour, 'x30060050', count * 3); }
        catch (error) {
          // Some exporters write the scalar count here instead of the XYZ point
          // count. Recover only that exact convention with complete numeric triplets.
          let scalars: number[] = [];
          try { scalars = decimals(contour, 'x30060050'); } catch { /* Keep the original diagnostic. */ }
          if (scalars.length !== count || scalars.length < 9 || scalars.length % 3 !== 0) {
            throw new Error(`${label}: ${error instanceof Error ? error.message : error}`);
          }
          data = scalars;
          repairedCounts++;
        }
        const polygon: vec3[] = [];
        for (let i = 0; i < data.length; i += 3) polygon.push(vec3.transformMat4(vec3.create(), data.slice(i, i + 3), inverse));
        if (polygon.some(p => p[0] < -0.5 || p[0] > nx - 0.5 || p[1] < -0.5 || p[1] > ny - 0.5)) throw new Error(`${label}: contour extends outside the referenced volume`);
        const plane = polygon[0][2], z = Math.round(plane);
        if (polygon.some(p => Math.abs(p[2] - plane) > 0.01)) throw new Error(`${label}: contours must be parallel to the referenced image planes`);
        if (z < 0 || z >= nz) throw new Error(`${label}: contour outside the referenced volume`);
        if (Math.abs(z - plane) > 0.01) offGrid++;
        let ymin = ny, ymax = 0;
        for (const p of polygon) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
        for (let y = Math.max(0, Math.ceil(ymin)); y <= Math.min(ny - 1, Math.floor(ymax)); y++) {
          const crossings: number[] = [];
          polygon.forEach((a, i) => {
            const b = polygon[(i + 1) % polygon.length];
            if ((a[1] > y) !== (b[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          });
          crossings.sort((a, b) => a - b);
          for (let i = 0; i + 1 < crossings.length; i += 2) {
            for (let x = Math.max(0, Math.ceil(crossings[i])); x < Math.min(nx, crossings[i + 1]); x++) {
              const index = x + nx * (y + ny * z);
              mask[index] = xor ? mask[index] ^ 1 : 1;
            }
          }
        }
      }
      const mesh = method === 'voxel' ? surface(mask, [nx, ny, nz], affine, label) : surfaceNets(mask, [nx, ny, nz], affine, label, method === 'smooth');
      if (mesh.indices.length) {
        if (roi.elements.x3006002a) mesh.color = decimals(roi, 'x3006002a', 3).map(v => Math.max(0, Math.min(255, v)) / 255);
        meshes.push(mesh);
      } else warnings.push(`${label}: no occupied voxels at the image resolution.`);
      if (repairedCounts) warnings.push(`${label}: corrected scalar counts to XYZ point counts in ${repairedCounts} contours.`);
      if (offGrid) warnings.push(`${label}: ${offGrid} contours sampled onto the nearest image plane.`);
    }
  }
  return { meshes, warnings, frameUID: [...usedFrames][0] };
}

function surface(mask: Uint8Array, dims: number[], affine: mat4, label: string): Mesh {
  const [nx, ny, nz] = dims;
  const points: number[] = [], indices: number[] = [];
  const vertices = new Map<string, number>();
  const occupied = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && mask[x + nx * (y + ny * z)];
  // Outward oriented corners for each exposed voxel face.
  const faces = [
    [[-1,0,0],[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],
    [[1,0,0],[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]],
    [[0,-1,0],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],
    [[0,1,0],[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]],
    [[0,0,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]],
    [[0,0,1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  ];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!occupied(x, y, z)) continue;
    for (const [normal, ...corners] of faces) {
      if (occupied(x + normal[0], y + normal[1], z + normal[2])) continue;
      const ids = corners.map(corner => {
        const p = [x + corner[0] / 2, y + corner[1] / 2, z + corner[2] / 2];
        const key = p.join(',');
        let id = vertices.get(key);
        if (id === undefined) {
          id = points.length / 3;
          if (id >= 2_000_000) throw new Error(`${label}: mesh exceeds two million vertices`);
          vertices.set(key, id);
          const lps = vec3.transformMat4(vec3.create(), p, affine);
          points.push(-lps[0], -lps[1], lps[2]);
        }
        return id;
      });
      indices.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    }
  }
  return Mesh.create({ label, points: Float32Array.from(points), indices: Uint32Array.from(indices) });
}
