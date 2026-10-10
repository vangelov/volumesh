import type { vec3 } from "gl-matrix";

export function getDominantAxis(v: vec3) {
  const ax = Math.abs(v[0]);
  const ay = Math.abs(v[1]);
  const az = Math.abs(v[2]);

  if (ax >= ay && ax >= az) return 0;

  if (ay >= az) return 1;

  return 2;
}
