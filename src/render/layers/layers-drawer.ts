import {
  PicoGL,
  type DrawCall,
  type App,
  type Texture,
  type Program,
  type Framebuffer,
  type VertexArray,
} from "picogl";
import { vec2, vec3 } from "gl-matrix";

import type { DrawParams } from "../draw-params";
import { LayersProgramSrc } from "./layers-program";

const LAYERS_COUNT = 8;

export class LayersDrawer {
  pico: App;
  layersProgram: Program;
  anatomyDrawCall: DrawCall;
  layerTextures: Texture[];
  drawCalls: DrawCall[];
  framebuffer: Framebuffer;

  static programSrc = LayersProgramSrc;

  constructor(pico: App, layersProgram: Program, anatomyDrawCall: DrawCall) {
    this.pico = pico;
    this.layersProgram = layersProgram;
    this.anatomyDrawCall = anatomyDrawCall;
    this.resize();
  }

  resize() {
    this.updateMeshesFramebuffer();
    this.updateLayerTextures();
  }

  updateLayerTextures() {
    this.layerTextures = [];

    for (let i = 0; i < LAYERS_COUNT; i++) {
      if (this.layerTextures[i]) this.layerTextures[i].delete();

      this.layerTextures[i] = this.pico.createTexture2D(
        this.pico.width,
        this.pico.height,
        {
          internalFormat: PicoGL.RGBA32F,
          minFilter: PicoGL.NEAREST,
          magFilter: PicoGL.NEAREST,
          wrapS: PicoGL.CLAMP_TO_EDGE,
          wrapT: PicoGL.CLAMP_TO_EDGE,
        },
      );

      this.anatomyDrawCall.texture("mesh_layer" + i, this.layerTextures[i]);
    }
  }

  updateMeshesFramebuffer() {
    if (this.framebuffer) {
      this.framebuffer.depthAttachment.delete();
      this.framebuffer.delete();
    }

    const depthRenderbuffer = this.pico.createRenderbuffer(
      this.pico.width,
      this.pico.height,
      PicoGL.DEPTH_COMPONENT24,
    );

    this.framebuffer = this.pico
      .createFramebuffer()
      .depthTarget(depthRenderbuffer);
  }

  updateMeshesDrawCalls(meshesVertexArrays: Array<VertexArray>) {
    this.drawCalls = meshesVertexArrays.map((vertexArray) =>
      this.pico.createDrawCall(this.layersProgram, vertexArray),
    );
  }

  draw({ anatomy, state, projViewMatrix }: DrawParams) {
    const anatomyState = state.byAnatomyId[anatomy.id];

    this.pico
      .disable(PicoGL.BLEND)
      .disable(PicoGL.CULL_FACE)
      .enable(PicoGL.DEPTH_TEST)
      .depthFunc(PicoGL.LESS)
      .depthMask(true)
      .drawFramebuffer(this.framebuffer)
      .clearColor(0, 0, 0, 1)
      .clearMask(PicoGL.COLOR_BUFFER_BIT | PicoGL.DEPTH_BUFFER_BIT);

    for (let layer = 0; layer < this.layerTextures.length; layer++) {
      this.framebuffer.colorTarget(0, this.layerTextures[layer]);

      this.pico.clear();

      for (let i = 0; i < this.drawCalls.length; i++) {
        const meshState = anatomyState.meshes.byIndex[i];
        if (!meshState.visible) continue;

        this.drawCalls[i]
          .uniform("proj_view", projViewMatrix)
          .uniform("peel_layer", layer)
          .uniform("mesh_color", meshState.color)
          .uniform(
            "viewport",
            vec2.fromValues(this.pico.width, this.pico.height),
          )
          .texture(
            "previous_layer",
            layer > 0
              ? this.layerTextures[layer - 1]
              : this.layerTextures[this.layerTextures.length - 1],
          )
          .draw();
      }
    }
  }
}
