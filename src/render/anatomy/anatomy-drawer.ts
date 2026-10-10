import {
  PicoGL,
  type DrawCall,
  type Program,
  type App,
  type Texture,
} from "picogl";
import { vec2, vec3 } from "gl-matrix";

import * as Data from "../../data";
import type { State } from "../../state";
import type { DrawParams } from "../draw-params";
import { AnatomyProgramSrc } from "./anatomy-program-src";

// prettier-ignore
const CUBE_STRIP = [
    1, 1, 0,
    0, 1, 0,
    1, 1, 1,
    0, 1, 1,
    0, 0, 1,
    0, 1, 0,
    0, 0, 0,
    1, 1, 0,
    1, 0, 0,
    1, 1, 1,
    1, 0, 1,
    0, 0, 1,
    1, 0, 0,
    0, 0, 0
];

export class AnatomyDrawer {
  pico: App;
  drawCall: DrawCall;
  volumeTexture: Texture;

  static programSrc = AnatomyProgramSrc;

  constructor(pico: App, anatomyProgram: Program) {
    this.pico = pico;
    this.createAnatomyDrawCall(anatomyProgram);
  }

  createAnatomyDrawCall(anatomyProgram: Program) {
    const buffer = this.pico.createVertexBuffer(
      PicoGL.FLOAT,
      3,
      new Float32Array(CUBE_STRIP),
    );

    const vertexArray = this.pico
      .createVertexArray()
      .vertexAttributeBuffer(0, buffer);

    this.drawCall = this.pico
      .createDrawCall(anatomyProgram, vertexArray)
      .uniform("mesh_layer_count", 8)
      .primitive(PicoGL.TRIANGLE_STRIP);
  }

  updateVolumeTexture(volume: Data.Volume) {
    const { data, dims } = volume;

    if (this.volumeTexture) this.volumeTexture.delete();
    this.volumeTexture = this.pico.createTexture3D(
      data,
      dims[0],
      dims[1],
      dims[2],
      {
        internalFormat: PicoGL.R8,
        minFilter: PicoGL.LINEAR,
        magFilter: PicoGL.LINEAR,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE,
        wrapR: PicoGL.CLAMP_TO_EDGE,
      },
    );

    this.drawCall.texture("volume", this.volumeTexture);
  }

  updateVolume(anatomy: Data.Anatomy, state: State) {
    const volumeIndex = state.byAnatomyId[anatomy.id].volume.index;
    const volume = anatomy.volumes[volumeIndex];
    this.updateVolumeTexture(volume);

    this.drawCall
      .uniform("volume_to_world", volume.volumeToWorld)
      .uniform("world_to_volume", volume.worldToVolume)
      .uniform("volume_dims", volume.dims);
  }

  draw({ camera, state, anatomy, projViewMatrix }: DrawParams) {
    const anatomyState = state.byAnatomyId[anatomy.id];

    this.pico.gl.cullFace(PicoGL.FRONT);

    this.pico
      .disable(PicoGL.DEPTH_TEST)
      .enable(PicoGL.CULL_FACE)
      .enable(PicoGL.BLEND)
      .blendFunc(PicoGL.ONE, PicoGL.ONE_MINUS_SRC_ALPHA)
      .defaultDrawFramebuffer()
      .clearColor(0.1294, 0.1451, 0.1608, 1)
      .clear();

    this.drawCall
      .uniform("proj_view", projViewMatrix)
      .uniform("eye_pos", [
        camera.invCamera[12],
        camera.invCamera[13],
        camera.invCamera[14],
      ])
      .uniform("dt_scale", anatomyState.volume.dtScale)
      .uniform("window_center", anatomyState.volume.windowCenter)
      .uniform("window_width", anatomyState.volume.windowWidth)
      .uniform("opacity_scale", anatomyState.volume.opacity)
      .uniform("mesh_alpha", anatomyState.meshes.opacity)
      .uniform(
        "clip_aabb_min",
        vec3.fromValues(
          anatomyState.volume.xMin,
          anatomyState.volume.yMin,
          anatomyState.volume.zMin,
        ),
      )
      .uniform(
        "clip_aabb_max",
        vec3.fromValues(
          anatomyState.volume.xMax,
          anatomyState.volume.yMax,
          anatomyState.volume.zMax,
        ),
      )
      .uniform("use_clip_sphere", anatomyState.meshes.useClipSphere ? 1 : 0)
      .uniform(
        "clip_sphere_center",
        anatomy.meshes[anatomyState.meshes.meshIndex].center,
      )
      .uniform("clip_sphere_radius", anatomyState.meshes.clipRadius)
      .uniform("show_volume", anatomyState.volume.show)
      .uniform("viewport", vec2.fromValues(this.pico.width, this.pico.height))
      .draw();
  }
}
