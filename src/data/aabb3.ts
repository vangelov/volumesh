import { vec3 } from "gl-matrix";

import type { Mesh } from "./mesh";

export type Aabb3 = {
  min: vec3;
  max: vec3;
};

export const Aabb3 = {
  fromMeshes,
};

function fromMeshes(meshes: Array<Mesh>) {
  const bounds: Aabb3 = {
    min: vec3.fromValues(+Infinity, +Infinity, +Infinity),
    max: vec3.fromValues(-Infinity, -Infinity, -Infinity),
  };

  for (const m of meshes) {
    const { points } = m;

    for (let i = 0; i < points.length; i += 3) {
      bounds.min[0] = Math.min(bounds.min[0], points[i + 0]);
      bounds.min[1] = Math.min(bounds.min[1], points[i + 1]);
      bounds.min[2] = Math.min(bounds.min[2], points[i + 2]);

      bounds.max[0] = Math.max(bounds.max[0], points[i + 0]);
      bounds.max[1] = Math.max(bounds.max[1], points[i + 1]);
      bounds.max[2] = Math.max(bounds.max[2], points[i + 2]);
    }
  }

  return bounds;
}
