/** Legacy VTK (ASCII / big-endian BINARY) surface triangle parser. */
export type VtkGeometry = {
  points: Float32Array;
  indices: Uint32Array;
};

type NumericArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array;

type Cells = { offsets: Uint32Array; connectivity: Uint32Array };

export class VtkParser {
  private readonly view: DataView;
  private readonly decoder = new TextDecoder();
  private pos = 0;
  private binary = false;
  private points?: Float32Array;
  private polygons?: Cells;
  private strips?: Cells;
  private cells?: Cells;
  private cellTypes?: Int32Array;
  private bytes: Uint8Array;

  vtkIdTypeBits = 32;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private line(): string {
    const start = this.pos;
    while (this.pos < this.bytes.length && this.bytes[this.pos] !== 10)
      this.pos++;
    const end = this.pos;
    if (this.pos < this.bytes.length) this.pos++;
    return this.decoder
      .decode(this.bytes.subarray(start, end))
      .replace(/\r$/, "")
      .trim();
  }

  private nextLine(): string {
    while (this.pos < this.bytes.length) {
      const line = this.line();
      if (line) return line;
    }
    return "";
  }

  private skipWhitespace(): void {
    while (this.pos < this.bytes.length) {
      const c = this.bytes[this.pos];
      if (c === 9 || c === 10 || c === 13 || c === 32) this.pos++;
      else break;
    }
  }

  private skipMetadata(): void {
    while (this.pos < this.bytes.length) {
      const savedPos = this.pos;
      const line = this.nextLine();

      if (!line) return;

      const key = line.split(/\s+/)[0].toUpperCase();

      // Metadata block finished
      if (
        [
          "POINTS",
          "POLYGONS",
          "TRIANGLE_STRIPS",
          "CELLS",
          "CELL_TYPES",
          "VERTICES",
          "LINES",
          "POINT_DATA",
          "CELL_DATA",
          "FIELD",
          "SCALARS",
          "VECTORS",
          "NORMALS",
          "TEXTURE_COORDINATES",
        ].includes(key)
      ) {
        this.pos = savedPos;
        return;
      }
    }
  }

  private token(): string {
    this.skipWhitespace();
    const start = this.pos;
    while (this.pos < this.bytes.length) {
      const c = this.bytes[this.pos];
      if (c === 9 || c === 10 || c === 13 || c === 32) break;
      this.pos++;
    }
    if (start === this.pos) throw new Error("Unexpected end of ASCII VTK data");
    return this.decoder.decode(this.bytes.subarray(start, this.pos));
  }

  private array(type: string, count: number): NumericArray {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error(`Invalid array count: ${count}`);
    const t = type.toLowerCase();
    let out: NumericArray;
    switch (t) {
      case "float":
        out = new Float32Array(count);
        break;
      case "double":
        out = new Float64Array(count);
        break;
      case "int":
        out = new Int32Array(count);
        break;
      case "unsigned_int":
        out = new Uint32Array(count);
        break;
      case "short":
        out = new Int16Array(count);
        break;
      case "unsigned_short":
        out = new Uint16Array(count);
        break;
      case "char":
        out = new Int8Array(count);
        break;
      case "unsigned_char":
        out = new Uint8Array(count);
        break;
      case "vtkidtype":
        out =
          this.vtkIdTypeBits === 64
            ? new BigInt64Array(count)
            : new Int32Array(count);
        break;
      default:
        throw new Error(`Unsupported VTK numeric type: ${type}`);
    }
    if (!this.binary) {
      for (let i = 0; i < count; i++) {
        if (out instanceof BigInt64Array) {
          out[i] = BigInt(this.token());
        } else {
          const value = Number(this.token());
          if (!Number.isFinite(value))
            throw new Error(`Invalid ASCII number at element ${i}`);
          out[i] = value;
        }
      }
      return out;
    }
    const size = out.BYTES_PER_ELEMENT;
    if (count * size > this.bytes.length - this.pos)
      throw new Error("Truncated binary VTK array");
    for (let i = 0; i < count; i++) {
      const offset = this.pos + i * size;
      switch (t) {
        case "float":
          out[i] = this.view.getFloat32(offset, false);
          break;
        case "double":
          out[i] = this.view.getFloat64(offset, false);
          break;
        case "int":
          out[i] = this.view.getInt32(offset, false);
          break;
        case "unsigned_int":
          out[i] = this.view.getUint32(offset, false);
          break;
        case "short":
          out[i] = this.view.getInt16(offset, false);
          break;
        case "unsigned_short":
          out[i] = this.view.getUint16(offset, false);
          break;
        case "char":
          out[i] = this.view.getInt8(offset);
          break;
        case "unsigned_char":
          out[i] = this.view.getUint8(offset);
          break;
        case "vtkidtype":
          if (out instanceof BigInt64Array) {
            out[i] = this.view.getBigInt64(offset, false);
          } else {
            out[i] = this.view.getInt32(offset, false);
          }
          break;
      }
    }
    this.pos += count * size;
    // Only the line terminator belongs to the binary block. Do not skip arbitrary whitespace:
    // a binary value can legitimately start with whitespace bytes.
    if (this.bytes[this.pos] === 13) this.pos++;
    if (this.bytes[this.pos] === 10) this.pos++;
    return out;
  }

  private readField(parts: string[]): void {
    const numberOfArrays = Number(parts[2]);

    if (!Number.isSafeInteger(numberOfArrays) || numberOfArrays < 0) {
      throw new Error("Invalid VTK FIELD array count");
    }

    for (let i = 0; i < numberOfArrays; i++) {
      const header = this.nextLine().split(/\s+/);

      if (header.length < 4) {
        throw new Error("Invalid VTK FIELD array header");
      }

      const components = Number(header[1]);
      const tuples = Number(header[2]);
      const type = header[3];

      if (
        !Number.isSafeInteger(components) ||
        !Number.isSafeInteger(tuples) ||
        components < 1 ||
        tuples < 0 ||
        !Number.isSafeInteger(components * tuples)
      ) {
        throw new Error("Invalid VTK FIELD dimensions");
      }

      // Read and discard FIELD data.
      this.array(type, components * tuples);
    }
  }

  private readCells(count: number, size: number): Cells {
    const raw = this.array("int", size) as Int32Array;
    const offsets = new Uint32Array(count + 1);
    const connectivity: number[] = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      if (cursor >= raw.length) throw new Error("Truncated VTK cells");
      const n = raw[cursor++];
      if (n < 0 || cursor + n > raw.length)
        throw new Error("Invalid VTK cell size");
      for (let j = 0; j < n; j++) {
        const index = raw[cursor++];
        if (index < 0) throw new Error("Negative vertex index");
        connectivity.push(index);
      }
      offsets[i + 1] = connectivity.length;
    }
    if (cursor !== raw.length)
      throw new Error("VTK cell connectivity size mismatch");
    return { offsets, connectivity: Uint32Array.from(connectivity) };
  }

  parse(): VtkGeometry {
    const header = this.line();
    if (!/^#\s*vtk\s+DataFile\s+Version\s+[\d.]+/i.test(header)) {
      throw new Error("Not a legacy VTK file");
    }
    this.line(); // Title
    const encoding = this.nextLine().toUpperCase();
    if (encoding !== "ASCII" && encoding !== "BINARY")
      throw new Error(`Unsupported VTK encoding: ${encoding}`);
    this.binary = encoding === "BINARY";
    const dataset = this.nextLine().split(/\s+/);
    if (
      dataset[0]?.toUpperCase() !== "DATASET" ||
      !["POLYDATA", "UNSTRUCTURED_GRID"].includes(dataset[1]?.toUpperCase())
    ) {
      throw new Error("Only POLYDATA and UNSTRUCTURED_GRID are supported");
    }

    let tuples = 0;
    while (this.pos < this.bytes.length) {
      const line = this.nextLine();
      if (!line) break;
      const parts = line.split(/\s+/);
      const key = parts[0].toUpperCase();
      switch (key) {
        case "POINTS": {
          const values = this.array(parts[2], Number(parts[1]) * 3);
          if (
            !(values instanceof Float32Array || values instanceof Float64Array)
          )
            throw new Error("POINTS must use float or double");
          this.points = Float32Array.from(values);
          break;
        }
        case "POLYGONS":
        case "TRIANGLE_STRIPS":
        case "CELLS": {
          const cells = this.readCells(Number(parts[1]), Number(parts[2]));
          if (key === "POLYGONS") this.polygons = cells;
          else if (key === "TRIANGLE_STRIPS") this.strips = cells;
          else this.cells = cells;
          break;
        }
        case "VERTICES":
        case "LINES":
          this.readCells(Number(parts[1]), Number(parts[2]));
          break;
        case "CELL_TYPES":
          this.cellTypes = this.array("int", Number(parts[1])) as Int32Array;
          break;
        case "POINT_DATA":
        case "CELL_DATA":
          tuples = Number(parts[1]);
          break;
        case "FIELD": {
          this.readField(parts);
          break;
        }
        case "SCALARS": {
          const lookup = this.nextLine();
          if (!/^LOOKUP_TABLE\s+/i.test(lookup))
            throw new Error("Expected LOOKUP_TABLE after SCALARS");
          this.array(parts[2], tuples * Number(parts[3] ?? 1));
          break;
        }
        case "VECTORS":
        case "NORMALS":
          this.array(parts[2], tuples * 3);
          break;
        case "TEXTURE_COORDINATES":
          this.array(parts[3], tuples * Number(parts[2]));
          break;
        case "METADATA": {
          this.skipMetadata();
          break;
        }
        default:
          throw new Error(`Unsupported VTK section: ${key}`);
      }
    }
    if (!this.points) throw new Error("VTK file has no POINTS");
    const indices: number[] = [];
    const triangle = (a: number, b: number, c: number): void => {
      if (a !== b && b !== c && a !== c) indices.push(a, b, c);
    };
    const fan = (cells: Cells, cell: number): void => {
      const { offsets, connectivity } = cells;
      const start = offsets[cell],
        end = offsets[cell + 1];
      for (let j = start + 1; j + 1 < end; j++)
        triangle(connectivity[start], connectivity[j], connectivity[j + 1]);
    };
    const strip = (cells: Cells, cell: number): void => {
      const { offsets, connectivity } = cells;
      const start = offsets[cell],
        end = offsets[cell + 1];
      for (let j = start; j + 2 < end; j++) {
        const a = connectivity[j],
          b = connectivity[j + 1],
          c = connectivity[j + 2];
        if ((j - start) % 2 === 0) triangle(a, b, c);
        else triangle(b, a, c);
      }
    };
    if (this.polygons)
      for (let i = 0; i + 1 < this.polygons.offsets.length; i++)
        fan(this.polygons, i);
    if (this.strips)
      for (let i = 0; i + 1 < this.strips.offsets.length; i++)
        strip(this.strips, i);
    if (this.cells) {
      if (
        !this.cellTypes ||
        this.cellTypes.length !== this.cells.offsets.length - 1
      )
        throw new Error("Missing or mismatched CELL_TYPES");
      for (let i = 0; i < this.cellTypes.length; i++) {
        const type = this.cellTypes[i];
        if (type === 5 || type === 7 || type === 9)
          fan(this.cells, i); // triangle, polygon, quad
        else if (type === 6)
          strip(this.cells, i); // triangle strip
        else if (![1, 2, 3, 4].includes(type))
          throw new Error(`Unsupported unstructured cell type: ${type}`);
      }
    }
    const vertexCount = this.points.length / 3;
    for (const index of indices)
      if (index >= vertexCount)
        throw new Error(`Vertex index out of bounds: ${index}`);
    return { points: this.points, indices: Uint32Array.from(indices) };
  }
}
