import type { NrrdHeader, NrrdDataType } from "./header";

export type NrrdPayload =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

export const NrrdPayload = { decode };

async function decompress(dataBytes: Uint8Array<ArrayBuffer>) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This NRRD is gzip encoded, but this browser does not expose DecompressionStream. " +
        "Re-save the NRRD with encoding: raw, or include a gzip library such as pako.",
    );
  }

  const stream = new Blob([dataBytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));

  const decompressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(decompressed);
}

export function fromBytes(header: NrrdHeader, bytes: Uint8Array): NrrdPayload {
  const { type, endian } = header;
  const littleEndian = endian === "little";

  switch (type) {
    case "uint8":
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    case "int8":
      return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (type) {
    case "uint16": {
      const count = Math.floor(bytes.byteLength / 2);
      const out = new Uint16Array(count);
      for (let i = 0; i < count; ++i)
        out[i] = view.getUint16(i * 2, littleEndian);
      return out;
    }

    case "int16": {
      const count = Math.floor(bytes.byteLength / 2);
      const out = new Int16Array(count);
      for (let i = 0; i < count; ++i)
        out[i] = view.getInt16(i * 2, littleEndian);
      return out;
    }

    case "uint32": {
      const count = Math.floor(bytes.byteLength / 4);
      const out = new Uint32Array(count);
      for (let i = 0; i < count; ++i)
        out[i] = view.getUint32(i * 4, littleEndian);
      return out;
    }

    case "int32": {
      const count = Math.floor(bytes.byteLength / 4);
      const out = new Int32Array(count);
      for (let i = 0; i < count; ++i)
        out[i] = view.getInt32(i * 4, littleEndian);
      return out;
    }

    case "float32": {
      const count = Math.floor(bytes.byteLength / 4);
      const out = new Float32Array(count);
      for (let i = 0; i < count; ++i)
        out[i] = view.getFloat32(i * 4, littleEndian);
      return out;
    }

    case "float64": {
      const count = Math.floor(bytes.byteLength / 8);
      const out = new Float64Array(count);
      for (let i = 0; i < count; ++i)
        out[i] = view.getFloat64(i * 8, littleEndian);
      return out;
    }
  }
}

function allocatePayload(type: NrrdDataType, count: number): NrrdPayload {
  switch (type) {
    case "uint8":
      return new Uint8Array(count);
    case "int8":
      return new Int8Array(count);
    case "uint16":
      return new Uint16Array(count);
    case "int16":
      return new Int16Array(count);
    case "uint32":
      return new Uint32Array(count);
    case "int32":
      return new Int32Array(count);
    case "float32":
      return new Float32Array(count);
    case "float64":
      return new Float64Array(count);
  }
}

export function fromText(
  header: NrrdHeader,
  text: string,
  count: number,
): NrrdPayload {
  const out = allocatePayload(header.type, count);
  const tokens = text.trim().split(/\s+/);

  for (let i = 0; i < count; ++i) {
    const value = parseFloat(tokens[i]);

    if (Number.isNaN(value)) {
      throw new Error(`Invalid ASCII value at index ${i}`);
    }

    out[i] = value;
  }

  return out;
}

export async function decode(
  header: NrrdHeader,
  bytes: Uint8Array<ArrayBuffer>,
) {
  const { encoding, sizes } = header;
  const valueCount = sizes.reduce((product, size) => product * size, 1);

  let payload: NrrdPayload;

  if (encoding === "ascii") {
    const text = new TextDecoder("ascii").decode(bytes);
    payload = fromText(header, text, valueCount);
  } else {
    let decodedBytes = bytes;
    if (encoding === "gzip") decodedBytes = await decompress(bytes);

    payload = fromBytes(header, decodedBytes);
  }

  if (payload.length !== valueCount) {
    throw new Error(
      `NRRD data length mismatch. Expected ${valueCount} values, got ${payload.length}`,
    );
  }

  return payload;
}
