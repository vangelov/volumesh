export const AnatomyProgramSrc = [getVertexShader(), getFragmentShader()];

function getVertexShader() {
  return `
#version 300 es

layout(location=0) in vec3 pos;

uniform mat4 proj_view;
uniform vec3 eye_pos;
uniform mat4 volume_to_world;
uniform mat4 world_to_volume;

out vec3 vray_dir;
flat out vec3 transformed_eye;

void main(void) {
    vec3 world_pos = (volume_to_world * vec4(pos, 1.0)).xyz;
    gl_Position = proj_view * vec4(world_pos, 1.0);
    transformed_eye = (world_to_volume * vec4(eye_pos, 1.0)).xyz;
    vray_dir = pos - transformed_eye;
}
`;
}

function getFragmentShader() {
  return `
#version 300 es

precision highp int;
precision highp float;

uniform highp sampler3D volume;
uniform bool show_volume;
uniform bool mask_volume_with_meshes;

uniform highp sampler2D mesh_layer0;
uniform highp sampler2D mesh_layer1;
uniform highp sampler2D mesh_layer2;
uniform highp sampler2D mesh_layer3;
uniform highp sampler2D mesh_layer4;
uniform highp sampler2D mesh_layer5;
uniform highp sampler2D mesh_layer6;
uniform highp sampler2D mesh_layer7;

uniform ivec3 volume_dims;
uniform float dt_scale;
uniform vec2 viewport;
uniform mat4 proj_view;
uniform mat4 volume_to_world;

uniform float window_center;
uniform float window_width;
uniform float opacity_scale;

uniform float mesh_alpha;
uniform int mesh_layer_count;

uniform vec3 clip_aabb_min;
uniform vec3 clip_aabb_max;

uniform int use_clip_sphere;
uniform vec3 clip_sphere_center;
uniform float clip_sphere_radius;

in vec3 vray_dir;
flat in vec3 transformed_eye;
out vec4 color;

void over(inout vec4 dst, vec4 src) {
    src.a = clamp(src.a, 0.0, 1.0);
    dst.rgb += (1.0 - dst.a) * src.a * src.rgb;
    dst.a   += (1.0 - dst.a) * src.a;
}

vec3 render_pos_of_volume_pos(vec3 p) {
    return (volume_to_world * vec4(p, 1.0)).xyz;
}

bool inside_clip_sphere(vec3 p) {
    if (use_clip_sphere == 0) return false;
    vec3 render_pos = render_pos_of_volume_pos(p);
    return distance(render_pos, clip_sphere_center) < clip_sphere_radius;
}


bool outside_clip_aabb(vec3 p) {
    return any(lessThan(p, clip_aabb_min)) || any(greaterThan(p, clip_aabb_max));
}

vec2 intersect_box(vec3 orig, vec3 dir) {
    const vec3 box_min = vec3(0.0);
    const vec3 box_max = vec3(1.0);
    vec3 safe_dir = dir;
    safe_dir.x = abs(safe_dir.x) < 1e-6 ? (safe_dir.x < 0.0 ? -1e-6 : 1e-6) : safe_dir.x;
    safe_dir.y = abs(safe_dir.y) < 1e-6 ? (safe_dir.y < 0.0 ? -1e-6 : 1e-6) : safe_dir.y;
    safe_dir.z = abs(safe_dir.z) < 1e-6 ? (safe_dir.z < 0.0 ? -1e-6 : 1e-6) : safe_dir.z;
    vec3 inv_dir = 1.0 / safe_dir;
    vec3 tmin_tmp = (box_min - orig) * inv_dir;
    vec3 tmax_tmp = (box_max - orig) * inv_dir;
    vec3 tmin = min(tmin_tmp, tmax_tmp);
    vec3 tmax = max(tmin_tmp, tmax_tmp);
    float t0 = max(tmin.x, max(tmin.y, tmin.z));
    float t1 = min(tmax.x, min(tmax.y, tmax.z));
    return vec2(t0, t1);
}

float wang_hash(int seed) {
    seed = (seed ^ 61) ^ (seed >> 16);
    seed *= 9;
    seed = seed ^ (seed >> 4);
    seed *= 0x27d4eb2d;
    seed = seed ^ (seed >> 15);
    return float(seed % 2147483647) / float(2147483647);
}

float linear_to_srgb(float x) {
    if (x <= 0.0031308) return 12.92 * x;
    return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

vec4 sample_mesh_layer(int i, vec2 uv) {
    if (i == 0) return texture(mesh_layer0, uv);
    if (i == 1) return texture(mesh_layer1, uv);
    if (i == 2) return texture(mesh_layer2, uv);
    if (i == 3) return texture(mesh_layer3, uv);
    if (i == 4) return texture(mesh_layer4, uv);
    if (i == 5) return texture(mesh_layer5, uv);
    if (i == 6) return texture(mesh_layer6, uv);

    return texture(mesh_layer7, uv);
}

void preload_mesh_layers(vec2 uv, out vec4 mesh_packed[8], out float mesh_depth[8]) {
    for (int i = 0; i < 8; ++i) {
        if (i < mesh_layer_count) {
            mesh_packed[i] = sample_mesh_layer(i, uv);
            mesh_depth[i] = mesh_packed[i].a;
        } else {
            mesh_packed[i] = vec4(0.0, 0.0, 0.0, 1.0);
            mesh_depth[i] = 1.0;
        }
    }
}

void composite_mesh_layers_only(
    inout vec4 dst,
    in vec4 mesh_packed[8]
) {
    for (int i = 0; i < 8; ++i) {
        if (i >= mesh_layer_count) break;

        vec4 packed = mesh_packed[i];

        // Alpha stores screen-space depth, not opacity.
        // Depth 1.0 means no mesh fragment.
        if (packed.a >= 0.999999) continue;

        over(dst, vec4(packed.rgb, mesh_alpha));
    }
}

float ray_t_for_screen_depth(float depth01, vec4 clip0, vec4 clip_step) {
    // depth01 is the peeled screen-space depth in [0, 1].
    // For p(t) = transformed_eye + t * ray_dir:
    // clip(t) = clip0 + t * clip_step.
    // Solve: (clip.z / clip.w) * 0.5 + 0.5 = depth01.
    float ndc_z = depth01 * 2.0 - 1.0;
    float denom = clip_step.z - ndc_z * clip_step.w;

    if (abs(denom) < 1e-8) {
        return 1e30;
    }

    return (ndc_z * clip0.w - clip0.z) / denom;
}

void compute_mesh_t_values(
    in float mesh_depth[8],
    vec4 clip0,
    vec4 clip_step,
    out float mesh_t[8]
) {
    for (int i = 0; i < 8; ++i) {
        if (i < mesh_layer_count && mesh_depth[i] < 0.999999) {
            mesh_t[i] = ray_t_for_screen_depth(mesh_depth[i], clip0, clip_step);
        } else {
            mesh_t[i] = 1e30;
        }
    }
}

bool has_visible_mesh_layers(in float mesh_t[8]) {
    for (int i = 0; i < 8; ++i) {
        if (i >= mesh_layer_count) break;
        if (mesh_t[i] < 1e29) return true;
    }
    return false;
}

void composite_crossed_mesh_layers(
    inout vec4 dst,
    float sample_t,
    in vec4 mesh_packed[8],
    in float mesh_t[8],
    inout int next_mesh_layer
) {
    // Fast path is handled outside this function:
    // only call this after sample_t has reached mesh_t[next_mesh_layer].
    for (int k = 0; k < 8; ++k) {
        if (next_mesh_layer >= mesh_layer_count) break;
        if (sample_t < mesh_t[next_mesh_layer]) break;

        vec4 packed = mesh_packed[next_mesh_layer];
        over(dst, vec4(packed.rgb, mesh_alpha));
        next_mesh_layer++;
    }
}

void main(void) {
    vec3 ray_dir = normalize(vray_dir);
    vec2 t_hit = intersect_box(transformed_eye, ray_dir);
    if (t_hit.x > t_hit.y) discard;
    t_hit.x = max(t_hit.x, 0.0);

    vec2 uv = gl_FragCoord.xy / viewport;

    vec4 mesh_packed[8];
    float mesh_depth[8];
    float mesh_t[8];
    preload_mesh_layers(uv, mesh_packed, mesh_depth);

    // A visible mesh masks the entire volume ray at this pixel.
    bool mesh_covers_pixel = mesh_layer_count > 0 && mesh_alpha > 0.0 && mesh_depth[0] < 0.999999;
    if (!show_volume || (mask_volume_with_meshes && mesh_covers_pixel)) {
        color = vec4(0.0);

        composite_mesh_layers_only(color, mesh_packed);

        color.r = linear_to_srgb(color.r);
        color.g = linear_to_srgb(color.g);
        color.b = linear_to_srgb(color.b);

        return;
    }

    vec3 dt_vec = 1.0 / (vec3(volume_dims) * abs(ray_dir));
    float dt = dt_scale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));
    float offset = wang_hash(int(gl_FragCoord.x + viewport.x * gl_FragCoord.y));

    // Compute the clip-space ray once per pixel. This replaces the expensive
    // per-step depth_of_volume_pos(p) matrix multiply.
    vec4 clip0 = proj_view * volume_to_world * vec4(transformed_eye, 1.0);
    vec4 clip_step = proj_view * volume_to_world * vec4(ray_dir, 0.0);
    compute_mesh_t_values(mesh_depth, clip0, clip_step, mesh_t);

    int next_mesh_layer = 0;
    bool has_mesh_layers = has_visible_mesh_layers(mesh_t);

    color = vec4(0.0);

    for (float t = t_hit.x; t < t_hit.y; t += dt) {
        float sample_t = min(t + offset * dt, t_hit.y);
        vec3 p = transformed_eye + sample_t * ray_dir;

        if (has_mesh_layers &&
            next_mesh_layer < mesh_layer_count &&
            sample_t >= mesh_t[next_mesh_layer]) {
            composite_crossed_mesh_layers(color, sample_t, mesh_packed, mesh_t, next_mesh_layer);
        }

        if (all(greaterThanEqual(p, vec3(0.0))) && all(lessThanEqual(p, vec3(1.0)))) {
            // Volume-only clipping. VTK meshes remain visible.
            if (outside_clip_aabb(p) || inside_clip_sphere(p)) {
                continue;
            }

            float raw_val = texture(volume, p).r;
            float val = clamp((raw_val - window_center) / max(window_width, 0.0001) + 0.5, 0.0, 1.0);
            vec4 val_color = vec4(val);
            val_color.a *= opacity_scale;
            val_color.a = 1.0 - pow(1.0 - val_color.a, dt_scale);
            over(color, val_color);
        }

        if (color.a >= 0.95) break;
    }

    // Catch mesh layers near the back of the volume proxy.
    if (has_mesh_layers && next_mesh_layer < mesh_layer_count) {
        composite_crossed_mesh_layers(color, t_hit.y, mesh_packed, mesh_t, next_mesh_layer);
    }

    color.r = linear_to_srgb(color.r);
    color.g = linear_to_srgb(color.g);
    color.b = linear_to_srgb(color.b);
}
`;
}
