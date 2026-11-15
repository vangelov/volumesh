export type ProgressCallback = (received: number, total: number) => void;

export async function request(url: string, onProgress?: ProgressCallback) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const contentEncoding = response.headers.get("Content-Encoding");
  const isGzipFile = new URL(url, location.href).pathname.endsWith(".gz");
  const needsDecompression = isGzipFile && !contentEncoding;

  let total = Number(response.headers.get("Content-Length")) || 0;
  if (total && contentEncoding?.toLowerCase() === "gzip") {
    total /= 0.7;
  }

  const reader = response.body.getReader();
  let received = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    received += value.byteLength;

    onProgress?.(total ? Math.min(received, total * 0.99) : received, total);
  }
  onProgress?.(total || received, total || received);

  const blob = new Blob(chunks);
  const result = needsDecompression
    ? blob.stream().pipeThrough(new DecompressionStream("gzip"))
    : blob.stream();
  const decompressedBlob = await new Response(result).blob();

  return {
    status: response.status,
    arrayBuffer: () => decompressedBlob.arrayBuffer(),
    text: () => decompressedBlob.text(),
  };
}

export async function requestBytes(url: string, onProgress?: ProgressCallback) {
  const response = await request(url, onProgress);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function requestText(url: string, onProgress?: ProgressCallback) {
  const response = await request(url, onProgress);
  const text = await response.text();
  return text;
}
