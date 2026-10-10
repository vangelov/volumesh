import { PicoGL, type Program, type App, type VertexArray } from "picogl";
import { mat4, vec3 } from "gl-matrix";

import * as Lib from "../lib";
import * as Data from "../data";
import { State } from "../state";
import { LayersDrawer } from "./layers/layers-drawer";
import { PickerDrawer } from "./picker/picker-drawer";
import { AnatomyDrawer } from "./anatomy/anatomy-drawer";
import type { DrawParams } from "./draw-params";

type Params = {
  anatomyProgram: Program;
  layersProgram: Program;
  pickProgram: Program;
};

const DEFAULT_EYE = vec3.set(vec3.create(), 0.5, 1.5, 0.5);
const CENTER = vec3.set(vec3.create(), 0.5, 0.5, 0.5);
const UP = vec3.set(vec3.create(), 0.0, 0.0, 1.0);
const FOV_Y = (60 * Math.PI) / 180.0;

export class Renderer {
  params: Params;
  pico: App;
  meshesVertexArrays: Array<VertexArray>;
  projMatrix: mat4;
  projViewMatrix: mat4;
  camera: Lib.OrbitCamera;
  canvasController: Lib.CanvasController;

  volumeNeedsUpdate: boolean;
  meshesNeedUpdate: boolean;
  cameraNeedsReset: boolean;

  layersDrawer: LayersDrawer;
  pickerDrawer: PickerDrawer;
  anatomyDrawer: AnatomyDrawer;

  static async create(canvas: HTMLCanvasElement) {
    const pico = PicoGL.createApp(canvas);

    const [anatomyProgram, layersProgram, pickProgram] =
      await pico.createPrograms(
        AnatomyDrawer.programSrc,
        LayersDrawer.programSrc,
        PickerDrawer.programSrc,
      );

    return new Renderer(pico, { anatomyProgram, layersProgram, pickProgram });
  }

  constructor(pico: App, params: Params) {
    this.params = params;
    this.pico = pico;
    this.pico.gl.pixelStorei(PicoGL.UNPACK_ALIGNMENT, 1);

    this.projViewMatrix = mat4.create();

    this.updateProjMatrix();
    this.updateCamera();
    this.createCanvasController();

    this.volumeNeedsUpdate = true;
    this.meshesNeedUpdate = true;
    this.cameraNeedsReset = true;

    this.pickerDrawer = new PickerDrawer(this.pico, params.pickProgram);
    this.anatomyDrawer = new AnatomyDrawer(this.pico, params.anatomyProgram);
    this.layersDrawer = new LayersDrawer(
      this.pico,
      params.layersProgram,
      this.anatomyDrawer.drawCall,
    );
  }

  updateProjMatrix() {
    this.projMatrix = mat4.perspective(
      mat4.create(),
      FOV_Y,
      this.pico.width / this.pico.height,
      0.1,
      100,
    );
  }

  updateCamera() {
    this.camera = new Lib.OrbitCamera(DEFAULT_EYE, CENTER, UP, 2, [
      this.pico.width,
      this.pico.height,
    ]);
  }

  resize(width: number, height: number) {
    this.pico.resize(width, height);

    this.updateProjMatrix();

    this.layersDrawer.resize();
    this.pickerDrawer.resize();
  }

  createCanvasController() {
    this.canvasController = new Lib.CanvasController();

    this.canvasController.mousemove = (prev, cur, evt) => {
      if (evt.buttons == 1) this.camera.rotate(prev, cur);
      else if (evt.buttons == 2)
        this.camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
    };

    this.canvasController.wheel = (amt) => {
      this.camera.zoom(amt);
    };

    this.canvasController.pinch = this.canvasController.wheel;

    this.canvasController.twoFingerDrag = (drag) => {
      this.camera.pan(drag);
    };

    this.canvasController.registerForCanvas(
      this.pico.canvas as HTMLCanvasElement,
    );
  }

  updateMeshesVertexArrays(meshes: Array<Data.Mesh>) {
    if (this.meshesVertexArrays) {
      this.meshesVertexArrays.forEach((vertexArray) => {
        vertexArray.delete();
      });
    }

    this.meshesVertexArrays = meshes.map(({ points, normals, indices }) => {
      if (!normals) throw new Error("Missing normals");

      return this.pico
        .createVertexArray()
        .vertexAttributeBuffer(
          0,
          this.pico.createVertexBuffer(PicoGL.FLOAT, 3, points),
        )
        .vertexAttributeBuffer(
          1,
          this.pico.createVertexBuffer(PicoGL.FLOAT, 3, normals),
        )
        .indexBuffer(this.pico.createIndexBuffer(PicoGL.UNSIGNED_INT, indices));
    });
  }

  draw(anatomy: Data.Anatomy, state: State) {
    if (this.volumeNeedsUpdate) {
      this.anatomyDrawer.updateVolume(anatomy, state);
      this.volumeNeedsUpdate = false;
    }

    if (this.meshesNeedUpdate) {
      this.updateMeshesVertexArrays(anatomy.meshes);
      this.layersDrawer.updateMeshesDrawCalls(this.meshesVertexArrays);
      this.pickerDrawer.updateMeshesDrawCalls(this.meshesVertexArrays);
      this.meshesNeedUpdate = false;
    }

    if (this.cameraNeedsReset) {
      this.updateCamera();
      this.fitCameraToMeshBounds(anatomy.world.bounds);
      this.cameraNeedsReset = false;
    }

    this.projViewMatrix = mat4.mul(
      this.projViewMatrix,
      this.projMatrix,
      this.camera.camera,
    );

    const drawParams: DrawParams = {
      projViewMatrix: this.projViewMatrix,
      camera: this.camera,
      anatomy,
      state,
    };

    this.layersDrawer.draw(drawParams);
    this.anatomyDrawer.draw(drawParams);
  }

  pick(x: number, y: number, anatomy: Data.Anatomy, state: State) {
    return this.pickerDrawer.pick(x, y, {
      anatomy,
      state,
      projViewMatrix: this.projViewMatrix,
      camera: this.camera,
    });
  }

  fitCameraToMeshBounds(bounds: Data.Aabb3) {
    const aspect = this.pico.width / this.pico.height;

    const sizeX = bounds.max[0] - bounds.min[0];
    const sizeY = bounds.max[1] - bounds.min[1];
    const sizeZ = bounds.max[2] - bounds.min[2];

    const longest = Math.max(sizeX, sizeY, sizeZ);
    if (longest <= 0) return;

    const radius =
      0.5 * Math.hypot(sizeX / longest, sizeY / longest, sizeZ / longest);

    const halfFovY = FOV_Y / 2;
    const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);

    this.camera.distance = radius / Math.sin(Math.min(halfFovX, halfFovY));

    vec3.set(this.camera.center, 0.5, 0.5, 0.5);

    this.camera.update();
  }
}
