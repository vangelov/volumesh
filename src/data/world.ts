import { vec3 } from "gl-matrix";

import { Aabb3 } from "./aabb3";
import { Volume } from "./volume";
import type { Mesh } from "./mesh";

export type World = {
  bounds: Aabb3;
  size: vec3;
  maxSize: number;
  offset: vec3;
};

export const World = {
  fromMeshes,
  fromVolumes,
};

//

function fromMeshes(meshes: Array<Mesh>): World {
  const bounds = Aabb3.fromMeshes(meshes);

  return fromBounds(bounds);
}

function fromVolumes(volumes: Array<Volume>): World {
  const bounds: Aabb3 = { min: vec3.fromValues(Infinity, Infinity, Infinity), max: vec3.fromValues(-Infinity, -Infinity, -Infinity) };
  for (const volume of volumes) {
    for (let corner = 0; corner < 8; corner++) {
      const point = vec3.clone(volume.origin);
      for (let axis = 0; axis < 3; axis++) {
        vec3.scaleAndAdd(point, point, volume.dirs[axis], (corner & (1 << axis)) ? volume.dims[axis] - 1 : 0);
      }
      const ras = Volume.getRasVec(point, volume.space);
      vec3.min(bounds.min, bounds.min, ras);
      vec3.max(bounds.max, bounds.max, ras);
    }
  }
  return fromBounds(bounds);
}

function fromBounds(bounds: Aabb3): World {
  const size = vec3.sub(vec3.create(), bounds.max, bounds.min);

  const maxSize = Math.max(size[0], size[1], size[2]);
  if (!Number.isFinite(maxSize) || maxSize <= 0) throw new Error("Anatomy has no spatial extent");

  const offset = vec3.fromValues(
    0.5 - (size[0] / maxSize) * 0.5,
    0.5 - (size[1] / maxSize) * 0.5,
    0.5 - (size[2] / maxSize) * 0.5,
  );

  return {
    bounds,
    size,
    maxSize,
    offset,
  };
}
