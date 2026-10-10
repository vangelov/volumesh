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

  let total = Number(response.headers.get("Content-Length")) || 0;
  if (total && contentEncoding === "gzip") {
    total = total / 0.7;
  }

  const reader = response.body.getReader();

  let received = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    received += value.byteLength;

    onProgress?.(received, total);
  }

  onProgress?.(total, total);

  const blob = new Blob(chunks);

  return {
    status: response.status,
    arrayBuffer: () => blob.arrayBuffer(),
    text: () => blob.text(),
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
