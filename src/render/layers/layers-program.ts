export const LayersProgramSrc = [getVertexShaderSrc(), getFragmentShaderSrc()];

function getVertexShaderSrc() {
  return `
#version 300 es

precision highp float;

layout(location=0) in vec3 pos;
layout(location=1) in vec3 normal;

uniform mat4 proj_view;

out vec3 vNormal;

void main() {
    vNormal = normalize(normal);
    gl_Position = proj_view * vec4(pos, 1.0);
}`;
}

function getFragmentShaderSrc() {
  return `
#version 300 es

precision highp float;

uniform sampler2D previous_layer;
uniform vec2 viewport;
uniform vec3 mesh_color;
uniform int peel_layer;

in vec3 vNormal;
out vec4 out_color_depth;

void main() {
    float my_depth = gl_FragCoord.z;

    if (peel_layer > 0) {
        vec2 uv = gl_FragCoord.xy / viewport;
        float previous_depth = texture(previous_layer, uv).a;
        if (my_depth <= previous_depth + 0.000001) discard;
    }

    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.4, 0.5, 1.0));
    float ambient = 0.35;
    float diffuse = abs(dot(n, lightDir));

    vec3 litColor = mesh_color * (ambient + 0.65 * diffuse);

    out_color_depth = vec4(litColor, my_depth);
}`;
}
