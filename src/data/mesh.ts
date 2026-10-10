import { vec3 } from "gl-matrix";

import type { World } from "./world";

export type Mesh = {
  label: string;

  points: Float32Array;
  indices: Uint32Array;

  center?: vec3;
  normals?: Float32Array;
};

export const Mesh = {
  create,
  updateCenter,
  updateNormals,
  sort,
  normalize,
};

type CreateParams = Pick<Mesh, "label" | "points" | "indices">;

function create({ points, indices, label }: CreateParams) {
  return { points, indices, label } as Mesh;
}

function updateCenter(mesh: Mesh) {
  const { points } = mesh;

  const min = vec3.fromValues(+Infinity, +Infinity, +Infinity);
  const max = vec3.fromValues(-Infinity, -Infinity, -Infinity);

  for (let i = 0; i < points.length; i += 3) {
    min[0] = Math.min(min[0], points[i + 0]);
    min[1] = Math.min(min[1], points[i + 1]);
    min[2] = Math.min(min[2], points[i + 2]);

    max[0] = Math.max(max[0], points[i + 0]);
    max[1] = Math.max(max[1], points[i + 1]);
    max[2] = Math.max(max[2], points[i + 2]);
  }

  const center = vec3.fromValues(
    0.5 * (min[0] + max[0]),
    0.5 * (min[1] + max[1]),
    0.5 * (min[2] + max[2]),
  );

  return { ...mesh, center } as Mesh;
}

function normalize(mesh: Mesh, world: World): Mesh {
  const { points } = mesh;
  const { bounds, maxSize, offset } = world;
  const normalizedPoints = new Float32Array(points.length);

  for (let i = 0; i < points.length; i += 3) {
    normalizedPoints[i + 0] =
      (points[i + 0] - bounds.min[0]) / maxSize + offset[0];

    normalizedPoints[i + 1] =
      (points[i + 1] - bounds.min[1]) / maxSize + offset[1];

    normalizedPoints[i + 2] =
      (points[i + 2] - bounds.min[2]) / maxSize + offset[2];
  }

  return { ...mesh, points: normalizedPoints };
}

function updateNormals(mesh: Mesh) {
  const { points, indices } = mesh;
  const normals = new Float32Array(points.length);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i + 0] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;

    const ax = points[ia + 0];
    const ay = points[ia + 1];
    const az = points[ia + 2];

    const bx = points[ib + 0];
    const by = points[ib + 1];
    const bz = points[ib + 2];

    const cx = points[ic + 0];
    const cy = points[ic + 1];
    const cz = points[ic + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;

    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    normals[ia + 0] += nx;
    normals[ia + 1] += ny;
    normals[ia + 2] += nz;

    normals[ib + 0] += nx;
    normals[ib + 1] += ny;
    normals[ib + 2] += nz;

    normals[ic + 0] += nx;
    normals[ic + 1] += ny;
    normals[ic + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i + 0], normals[i + 1], normals[i + 2]);

    if (len > 1e-8) {
      normals[i + 0] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }

  return { ...mesh, normals } as Mesh;
}

function sort(meshes: Array<Mesh>) {
  return [...meshes].sort((a, b) => {
    const aw = a.label.split(" ");
    const bw = b.label.split(" ");

    let i = aw.length - 1;
    let j = bw.length - 1;

    while (i >= 0 && j >= 0) {
      const cmp = aw[i--].localeCompare(bw[j--]);
      if (cmp !== 0) return cmp;
    }

    return aw.length - bw.length;
  });
}
