export type Vec3 = [number, number, number];

export type NrrdDataType =
  | "uint8"
  | "int8"
  | "uint16"
  | "int16"
  | "uint32"
  | "int32"
  | "float32"
  | "float64";

export type NrrdEncoding = "raw" | "gzip" | "ascii";

export type NrrdEndian = "little" | "big";

export type NrrdHeaderFields = Record<string, string>;

export type NrrdHeader = {
  type: NrrdDataType;
  dimension: number;
  sizes: number[];
  encoding: NrrdEncoding;
  endian: NrrdEndian;

  spaceOrigin?: Vec3;
  spaceDirections?: Array<Vec3 | null>;
  spacings?: number[];
  space?: string;
  kinds?: string[];

  raw: NrrdHeaderFields;
};

export const NrrdHeader = {
  parse,
  findOffset,
  coerce,
};

function coerceDataType(value: string): NrrdDataType {
  switch (value.trim().toLowerCase()) {
    case "uchar":
    case "unsigned char":
    case "uint8":
    case "uint8_t":
      return "uint8";

    case "signed char":
    case "int8":
    case "int8_t":
      return "int8";

    case "ushort":
    case "unsigned short":
    case "unsigned short int":
    case "uint16":
    case "uint16_t":
      return "uint16";

    case "short":
    case "short int":
    case "signed short":
    case "signed short int":
    case "int16":
    case "int16_t":
      return "int16";

    case "uint":
    case "unsigned int":
    case "uint32":
    case "uint32_t":
      return "uint32";

    case "int":
    case "signed int":
    case "int32":
    case "int32_t":
      return "int32";

    case "float":
      return "float32";

    case "double":
      return "float64";

    default:
      throw new Error(`Unsupported NRRD type: ${value}`);
  }
}

function coerceEncoding(value?: string): NrrdEncoding {
  switch ((value ?? "raw").trim().toLowerCase()) {
    case "raw":
      return "raw";

    case "gzip":
    case "gz":
      return "gzip";

    case "ascii":
    case "text":
    case "txt":
      return "ascii";

    default:
      throw new Error(`Unsupported NRRD encoding: ${value}`);
  }
}

function coerceEndian(value?: string): NrrdEndian {
  const endian = (value ?? "little").trim().toLowerCase();

  if (endian === "little" || endian === "big") {
    return endian;
  }

  throw new Error(`Unsupported NRRD endian: ${value}`);
}

function parseVec3(value: string): Vec3 | null {
  const match = value.trim().match(/^\(([^)]*)\)$/);

  if (!match) {
    return null;
  }

  const nums = match[1].split(",").map((x) => parseFloat(x.trim()));

  if (nums.length !== 3 || !nums.every(Number.isFinite)) {
    return null;
  }

  return [nums[0], nums[1], nums[2]];
}

function parseVec3List(value?: string): Array<Vec3 | null> | null {
  if (!value) {
    return null;
  }

  const matches = value.match(/\([^)]*\)|none/gi);

  if (!matches) {
    return null;
  }

  return matches.map((item) =>
    /^none$/i.test(item.trim()) ? null : parseVec3(item.trim()),
  );
}

export function coerce(raw: NrrdHeaderFields): NrrdHeader {
  if (!raw["sizes"]) {
    throw new Error("NRRD header is missing required field: sizes");
  }

  if (!raw["type"]) {
    throw new Error("NRRD header is missing required field: type");
  }

  const sizes = raw["sizes"].split(/\s+/).map((x) => parseInt(x, 10));
  if (!sizes.length || sizes.some((x) => !Number.isFinite(x) || x <= 0)) {
    throw new Error("Invalid NRRD sizes: " + raw["sizes"]);
  }

  const dimension = parseInt(raw["dimension"] || String(sizes.length), 10);
  if (!Number.isFinite(dimension) || dimension !== sizes.length) {
    throw new Error(
      `NRRD dimension (${dimension}) does not match sizes length (${sizes.length})`,
    );
  }

  const spacings = raw["spacings"]?.split(/\s+/).map((x) => parseFloat(x));

  const spaceOrigin = raw["space origin"]
    ? parseVec3(raw["space origin"])
    : null;

  return {
    type: coerceDataType(raw["type"]),
    dimension,
    sizes,
    encoding: coerceEncoding(raw["encoding"]),
    endian: coerceEndian(raw["endian"]),

    space: raw["space"],
    spaceOrigin: spaceOrigin ?? undefined,
    spaceDirections: raw["space directions"]
      ? (parseVec3List(raw["space directions"]) ?? undefined)
      : undefined,
    spacings,
    kinds: raw["kinds"]?.split(/\s+/),

    raw,
  };
}

export function findOffset(bytes: Uint8Array): number {
  // Header ends at either \n\n or \r\n\r\n.
  for (let i = 0; i < bytes.length - 3; ++i) {
    if (bytes[i] === 10 && bytes[i + 1] === 10) {
      return i + 2;
    }

    if (
      bytes[i] === 13 &&
      bytes[i + 1] === 10 &&
      bytes[i + 2] === 13 &&
      bytes[i + 3] === 10
    ) {
      return i + 4;
    }
  }

  throw new Error("Could not find end of NRRD header");
}

function parse(bytes: Uint8Array): NrrdHeaderFields {
  const headerText = new TextDecoder("ascii").decode(bytes);

  const lines = headerText.split(/\r?\n/);
  const fields: NrrdHeaderFields = {};

  if (!lines[0] || lines[0].indexOf("NRRD") !== 0) {
    throw new Error("Not an NRRD file");
  }

  for (let i = 1; i < lines.length; ++i) {
    const line = lines[i].trim();

    if (!line || line[0] === "#") {
      continue;
    }

    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }

    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    fields[key] = value;
  }

  return fields;
}
