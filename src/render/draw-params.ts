import type { mat4 } from "gl-matrix";

import * as Lib from "../lib";
import * as Data from "../data";
import { State } from "../state";

export type DrawParams = {
  camera: Lib.OrbitCamera;
  state: State;
  anatomy: Data.Anatomy;
  projViewMatrix: mat4;
};
