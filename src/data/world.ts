import { vec3 } from "gl-matrix";

import { Aabb3 } from "./aabb3";
import type { Mesh } from "./mesh";

export type World = {
  bounds: Aabb3;
  size: vec3;
  maxSize: number;
  offset: vec3;
};

export const World = {
  fromMeshes,
};

//

function fromMeshes(meshes: Array<Mesh>): World {
  const bounds = Aabb3.fromMeshes(meshes);

  const size = vec3.sub(vec3.create(), bounds.max, bounds.min);

  const maxSize = Math.max(size[0], size[1], size[2]);

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
