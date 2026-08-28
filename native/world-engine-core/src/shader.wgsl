struct Uniforms {
    mvp: mat4x4<f32>,
    model: mat4x4<f32>,
    light_dir: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> u: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_normal: vec3<f32>,
    @location(1) color: vec3<f32>,
};

@vertex
fn vs_main(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec3<f32>,
) -> VertexOutput {
    var out: VertexOutput;
    out.position = u.mvp * vec4<f32>(position, 1.0);
    // Rotation-only model matrix (no non-uniform scale in this v0), so
    // transforming the normal by the model matrix directly is correct —
    // no inverse-transpose needed.
    out.world_normal = normalize((u.model * vec4<f32>(normal, 0.0)).xyz);
    out.color = color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let n = normalize(in.world_normal);
    let l = normalize(u.light_dir.xyz);
    let diffuse = max(dot(n, l), 0.0);
    let ambient = 0.25;
    let lit = ambient + diffuse * (1.0 - ambient);
    return vec4<f32>(in.color * lit, 1.0);
}
