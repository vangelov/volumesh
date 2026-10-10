export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export const TarrayUtils = {
  normalizeToUint8,
  extractFirstComponent,
};

function normalizeToUint8(values: TypedArray, count: number): Uint8Array {
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = 0; i < count; ++i) {
    const v = values[i];

    if (!Number.isFinite(v)) {
      continue;
    }

    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const out = new Uint8Array(count);

  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) {
    return out;
  }

  const scale = 255.0 / (maxV - minV);

  for (let i = 0; i < count; ++i) {
    const x = Math.round((values[i] - minV) * scale);
    out[i] = Math.max(0, Math.min(255, x));
  }

  return out;
}

function extractFirstComponent<T extends TypedArray>(
  values: TypedArray,
  length: number,
  componentCount: number,
): T {
  const TypedArrayConstructor = values.constructor as {
    new (length: number): T;
  };

  const extracted = new TypedArrayConstructor(length);

  for (let i = 0; i < length; ++i) {
    extracted[i] = values[i * componentCount];
  }

  return extracted;
}
