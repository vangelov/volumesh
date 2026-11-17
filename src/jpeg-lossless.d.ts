declare module "jpeg-lossless-decoder-js" {
  export class Decoder {
    decode(buffer: ArrayBuffer, offset?: number, length?: number, numBytes?: number): Uint8Array | Uint16Array;
  }
}
