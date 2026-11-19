import dicom from 'dicom-parser';
import { meshesFromRtstruct } from './rtstruct';
import type { ReconstructionJob } from './reconstruct';

const scope = self as unknown as {
  onmessage: (event: MessageEvent<ReconstructionJob>) => void;
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
};
scope.onmessage = event => {
  try {
    const { structures, volumes, method } = event.data;
    const result = meshesFromRtstruct(structures.map(bytes => dicom.parseDicom(bytes)), volumes, method);
    const transfer = result.meshes.flatMap(mesh => [mesh.points.buffer, mesh.indices.buffer]) as ArrayBuffer[];
    scope.postMessage({ result }, transfer);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
