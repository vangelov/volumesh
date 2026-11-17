import { mat4, vec3 } from "gl-matrix";

import * as Lib from "../lib";
import * as Data from "../data";

export type Volume = {
  label: string;
  origin: vec3;
  dims: vec3;
  dirs: Array<vec3>;
  data: Uint8Array;

  volumeToWorld: mat4;
  worldToVolume: mat4;

  space?: string;
};

export const Volume = {
  fromNrrd,
  getRasVec,
  register,
};

function getDirsFromNrrd(header: Lib.NrrdHeader) {
  let parsedDirs = header.spaceDirections;
  if (!parsedDirs || parsedDirs.length < 3) {
    const spacings = header.spacings || [1, 1, 1];

    parsedDirs = [
      [spacings[0] || 1, 0, 0],
      [0, spacings[1] || 1, 0],
      [0, 0, spacings[2] || 1],
    ];
  }

  // If the NRRD is component-first 4D, space directions may include a leading "none".
  const dirs = parsedDirs
    .filter((v) => v !== null)
    .slice(0, 3)
    .map((parsedDir) =>
      vec3.fromValues(parsedDir[0], parsedDir[1], parsedDir[2]),
    );

  while (dirs.length < 3) {
    dirs.push(
      vec3.fromValues(
        dirs.length === 0 ? 1 : 0,
        dirs.length === 1 ? 1 : 0,
        dirs.length === 2 ? 1 : 0,
      ),
    );
  }

  return dirs;
}

function getDataFromNrrd(nrrd: Lib.Nrrd, dims: vec3, componentCount: number) {
  const voxelCount = dims[0] * dims[1] * dims[2];
  const { payload } = nrrd;

  const scalarValues =
    componentCount > 1
      ? Lib.TarrayUtils.extractFirstComponent(
          payload,
          voxelCount,
          componentCount,
        )
      : payload;

  if (scalarValues.length < voxelCount) {
    throw new Error("NRRD data is shorter than expected");
  }

  if (scalarValues instanceof Uint8Array) return scalarValues;

  return Lib.TarrayUtils.normalizeToUint8(scalarValues, voxelCount);
}

function getDimsAndComponentCountFromNrrd(header: Lib.NrrdHeader) {
  let dims: vec3;
  let componentCount = 1;

  const firstKind = header.kinds?.[0]?.toLowerCase();
  const componentFirst =
    header.dimension === 4 &&
    (header.spaceDirections?.[0] === null ||
      firstKind === "vector" ||
      firstKind === "list" ||
      firstKind === "color" ||
      firstKind === "rgb-color" ||
      firstKind === "rgba-color");

  if (header.dimension === 3) {
    dims = [header.sizes[0], header.sizes[1], header.sizes[2]];
  } else if (componentFirst) {
    componentCount = header.sizes[0];
    dims = [header.sizes[1], header.sizes[2], header.sizes[3]];
  } else {
    throw new Error("Expected scalar 3D NRRD or 4D component-first NRRD");
  }

  return { dims, componentCount };
}

function fromNrrd(nrrd: Lib.Nrrd, label: string): Volume {
  const { header } = nrrd;

  const origin = header.spaceOrigin
    ? vec3.fromValues(
        header.spaceOrigin[0],
        header.spaceOrigin[1],
        header.spaceOrigin[2],
      )
    : vec3.fromValues(0, 0, 0);

  const dirs = getDirsFromNrrd(header);

  const { dims, componentCount } = getDimsAndComponentCountFromNrrd(header);
  const data = getDataFromNrrd(nrrd, dims, componentCount);

  const space = header.space;

  const volumeToWorld = mat4.identity(mat4.create());

  const worldToVolume = mat4.identity(mat4.create());

  return {
    label,
    origin,
    dims,
    dirs,
    data,

    space,

    volumeToWorld,
    worldToVolume,
  };
}

function getRasVec(v: vec3, space = "") {
  // NRRD files often declare LPS. Slicer/VTK atlas meshes are commonly in RAS.

  if (space.indexOf("left-posterior-superior") >= 0 || space === "lps")
    return vec3.fromValues(-v[0], -v[1], v[2]);

  if (space.indexOf("right-anterior-superior") >= 0 || space === "ras")
    return v;

  if (space.indexOf("left-anterior-superior") >= 0 || space === "las")
    return vec3.fromValues(-v[0], v[1], v[2]);

  if (space.indexOf("right-posterior-superior") >= 0 || space === "rps")
    return vec3.fromValues(v[0], -v[1], v[2]);

  return v;
}

function register(volume: Volume, world: Data.World): Volume {
  const { space, dirs, dims } = volume;

  const origin = getRasVec(volume.origin, space);

  const dir0 = getRasVec(dirs[0], space);
  const dir1 = getRasVec(dirs[1], space);
  const dir2 = getRasVec(dirs[2], space);

  function axisColumn(dir: vec3, n: number, axis: number) {
    return (dir[axis] * (n - 1.0)) / world.maxSize;
  }

  const c0 = [
    axisColumn(dir0, dims[0], 0),
    axisColumn(dir0, dims[0], 1),
    axisColumn(dir0, dims[0], 2),
  ];

  const c1 = [
    axisColumn(dir1, dims[1], 0),
    axisColumn(dir1, dims[1], 1),
    axisColumn(dir1, dims[1], 2),
  ];

  const c2 = [
    axisColumn(dir2, dims[2], 0),
    axisColumn(dir2, dims[2], 1),
    axisColumn(dir2, dims[2], 2),
  ];

  const t = [
    (origin[0] - world.bounds.min[0]) / world.maxSize + world.offset[0],
    (origin[1] - world.bounds.min[1]) / world.maxSize + world.offset[1],
    (origin[2] - world.bounds.min[2]) / world.maxSize + world.offset[2],
  ];

  const volumeToWorld = mat4.fromValues(
    c0[0],
    c0[1],
    c0[2],
    0,

    c1[0],
    c1[1],
    c1[2],
    0,

    c2[0],
    c2[1],
    c2[2],
    0,

    t[0],
    t[1],
    t[2],
    1,
  );

  const worldToVolume = mat4.invert(mat4.create(), volumeToWorld);
  if (!worldToVolume) throw new Error("Could not invert volumeToWorld matrix");

  return { ...volume, dirs: [dir0, dir1, dir2], volumeToWorld, worldToVolume };
}
