import { NrrdHeader } from "./header";
import { NrrdPayload } from "./payload";

export type Nrrd = {
  header: NrrdHeader;
  payload: NrrdPayload;
};

export const Nrrd = {
  parse,
};

async function parse(bytes: Uint8Array<ArrayBuffer>) {
  const headerOffset = NrrdHeader.findOffset(bytes);
  const headerBytes = bytes.subarray(0, headerOffset);
  const headerFields = NrrdHeader.parse(headerBytes);
  const header = NrrdHeader.coerce(headerFields);

  const payloadBytes = bytes.subarray(headerOffset);
  const payload = await NrrdPayload.decode(header, payloadBytes);

  return {
    header,
    payload,
  };
}
