import type { DataSet } from 'dicom-parser';
import type { Volume } from '../data/volume';
import { meshesFromRtstruct } from './rtstruct';
import type { ReconstructionMethod } from './rtstruct';

export type ReconstructionResult = ReturnType<typeof meshesFromRtstruct>;
export type ReconstructionJob = { structures: Uint8Array[]; volumes: Volume[]; method: ReconstructionMethod };

/** Browser builds run off the main thread; the fallback supports headless tests. */
export function createReconstructor(structures: DataSet[], volumes: Volume[]) {
  return async (method: ReconstructionMethod): Promise<ReconstructionResult> => {
    if (!structures.length || typeof Worker === 'undefined') return meshesFromRtstruct(structures, volumes, method);
    const worker = new Worker(new URL('./rtstruct-worker.ts', import.meta.url), { type: 'module' });
    try {
      return await new Promise<ReconstructionResult>((resolve, reject) => {
        worker.onmessage = event => {
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.result);
        };
        worker.onerror = event => reject(new Error(event.message || 'Mesh reconstruction worker failed.'));
        worker.onmessageerror = () => reject(new Error('Could not receive reconstructed meshes.'));
        const job: ReconstructionJob = {
          structures: structures.map(ds => Uint8Array.from(ds.byteArray)),
          // Geometry and references only: do not copy volume pixel buffers.
          volumes: volumes.map(volume => ({ ...volume, data: new Uint8Array() })), method,
        };
        worker.postMessage(job, job.structures.map(bytes => bytes.buffer as ArrayBuffer));
      });
    } finally { worker.terminate(); }
  };
}
