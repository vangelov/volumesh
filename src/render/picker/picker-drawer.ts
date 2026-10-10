import {
  PicoGL,
  type DrawCall,
  type App,
  type Program,
  type Framebuffer,
  type VertexArray,
} from "picogl";
import { vec3 } from "gl-matrix";

import { PickerProgramSrc } from "./picker-program";
import type { DrawParams } from "../draw-params";

function encodePickID(id: number) {
  return [
    ((id >> 16) & 255) / 255.0,
    ((id >> 8) & 255) / 255.0,
    (id & 255) / 255.0,
  ];
}

function decodePickID(pixel: Uint8Array) {
  return (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
}

//

export class PickerDrawer {
  pico: App;
  pickerProgram: Program;
  drawCalls: DrawCall[];
  framebuffer: Framebuffer;

  static programSrc = PickerProgramSrc;

  constructor(pico: App, pickerProgram: Program) {
    this.pico = pico;
    this.pickerProgram = pickerProgram;
    this.resize();
  }

  resize() {
    this.updateMeshesFramebuffer();
  }

  updateMeshesFramebuffer() {
    if (this.framebuffer) {
      this.framebuffer.delete();
      this.framebuffer.depthAttachment.delete();
      this.framebuffer.colorAttachments[0].delete();
    }
    this.framebuffer = this.pico.createFramebuffer();

    const depthRenderbuffer = this.pico.createRenderbuffer(
      this.pico.width,
      this.pico.height,
      PicoGL.DEPTH_COMPONENT24,
    );

    const colorTarget = this.pico.createTexture2D(
      this.pico.width,
      this.pico.height,
      {
        internalFormat: PicoGL.RGBA8,
        minFilter: PicoGL.NEAREST,
        magFilter: PicoGL.NEAREST,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE,
      },
    );

    this.framebuffer.depthTarget(depthRenderbuffer).colorTarget(0, colorTarget);
  }

  updateMeshesDrawCalls(meshesVertexArrays: Array<VertexArray>) {
    this.drawCalls = meshesVertexArrays.map((vertexArray, index) =>
      this.pico
        .createDrawCall(this.pickerProgram, vertexArray)
        .uniform("pick_color", encodePickID(index)),
    );
  }

  pick(x: number, y: number, { state, anatomy, projViewMatrix }: DrawParams) {
    const anatomyState = state.byAnatomyId[anatomy.id];

    this.pico
      .drawFramebuffer(this.framebuffer)
      .clearColor(0, 0, 0, 0)
      .clear()
      .disable(PicoGL.BLEND)
      .disable(PicoGL.CULL_FACE)
      .enable(PicoGL.DEPTH_TEST)
      .depthFunc(PicoGL.LESS)
      .depthMask(true);

    for (let i = 0; i < this.drawCalls.length; i++) {
      const meshState = anatomyState.meshes.byIndex[i];
      if (!meshState.visible) continue;

      this.drawCalls[i].uniform("proj_view", projViewMatrix).draw();
    }

    const pixel = new Uint8Array(4);
    this.pico
      .readFramebuffer(this.framebuffer)
      .readPixel(x, this.pico.height - 1 - y, pixel);
    if (pixel[3] === 0) return -1;

    const index = decodePickID(pixel);
    return index;
  }
}
