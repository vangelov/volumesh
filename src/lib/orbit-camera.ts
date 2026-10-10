import { mat4, vec2, vec3 } from "gl-matrix";

export class OrbitCamera {
  worldUp: vec3;
  center: vec3;

  rotateSpeed: number;
  maxPitch: number;
  distance: number;
  yaw: number;
  pitch: number;

  camera: mat4;
  invCamera: mat4;

  zoomSpeed: number;
  screenDims: vec2;

  constructor(
    eye: vec3,
    center: vec3,
    up: vec3,
    zoomSpeed = 2,
    screenDims: [number, number],
  ) {
    this.center = vec3.clone(center);
    this.worldUp = vec3.clone(up);

    this.zoomSpeed = zoomSpeed;
    this.screenDims = screenDims;

    // Radians per pixel.
    this.rotateSpeed = 0.006;

    this.maxPitch = Math.PI / 2 - 0.001;

    const offset = vec3.create();
    vec3.subtract(offset, eye, center);

    this.distance = vec3.length(offset);

    // Z is "up".
    // yaw = rotation around anatomy Z axis
    // pitch = above / below anatomy
    this.yaw = Math.atan2(offset[1], offset[0]);

    const horizontalDistance = Math.sqrt(
      offset[0] * offset[0] + offset[1] * offset[1],
    );

    this.pitch = Math.atan2(offset[2], horizontalDistance);

    this.camera = mat4.create();
    this.invCamera = mat4.create();

    this.update();
  }

  update() {
    const cp = Math.cos(this.pitch);

    const eye = vec3.fromValues(
      this.center[0] + this.distance * cp * Math.cos(this.yaw),
      this.center[1] + this.distance * cp * Math.sin(this.yaw),
      this.center[2] + this.distance * Math.sin(this.pitch),
    );

    mat4.lookAt(this.camera, eye, this.center, this.worldUp);
    mat4.invert(this.invCamera, this.camera);
  }

  rotate(prev: vec2, cur: vec2) {
    const dx = cur[0] - prev[0];
    const dy = cur[1] - prev[1];

    this.yaw -= dx * this.rotateSpeed;

    this.pitch += dy * this.rotateSpeed;
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));

    this.update();
  }

  zoom(amount: number) {
    const scale = Math.exp(-amount * 0.001 * this.zoomSpeed);

    this.distance *= scale;

    this.distance = Math.max(0.05, Math.min(100.0, this.distance));

    this.update();
  }

  pan(delta: vec2) {
    const right = vec3.fromValues(-Math.sin(this.yaw), Math.cos(this.yaw), 0);

    const vertical = this.worldUp;

    const panScale =
      (this.distance * 1.5) / Math.max(this.screenDims[0], this.screenDims[1]);

    vec3.scaleAndAdd(this.center, this.center, right, -delta[0] * panScale);
    vec3.scaleAndAdd(this.center, this.center, vertical, -delta[1] * panScale);

    this.update();
  }
}
