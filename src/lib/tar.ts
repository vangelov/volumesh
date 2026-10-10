export type TarFile = {
  name: string;
  data: Uint8Array<ArrayBuffer>;
};

export const TarFile = {
  parse,
};

async function parse(tar: Uint8Array) {
  const textDecoder = new TextDecoder();

  function readString(bytes: Uint8Array) {
    const end = bytes.indexOf(0);
    return textDecoder.decode(end === -1 ? bytes : bytes.subarray(0, end));
  }

  const files: TarFile[] = [];
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);

    if (header.every((b) => b === 0)) break;

    const name = readString(header.subarray(0, 100));
    const sizeText = readString(header.subarray(124, 136)).trim();
    const size = parseInt(sizeText, 8) || 0;
    const type = header[156];

    offset += 512;

    if (type === 0 || type === 48) {
      files.push({
        name,
        data: tar.subarray(offset, offset + size) as Uint8Array<ArrayBuffer>,
      });
    }

    // TAR entries are padded to 512-byte boundaries
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}
