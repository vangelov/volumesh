export const PickerProgramSrc = [getVertexShaderSrc(), getFragmentShaderSrc()];

function getVertexShaderSrc() {
  return `
#version 300 es
precision highp float;

layout(location=0) in vec3 pos;

uniform mat4 proj_view;

void main() {
    gl_Position = proj_view * vec4(pos, 1.0);
}`;
}

function getFragmentShaderSrc() {
  return `
#version 300 es
precision highp float;

uniform vec3 pick_color;
out vec4 out_color;

void main() {
    out_color = vec4(pick_color, 1.0);
}`;
}
