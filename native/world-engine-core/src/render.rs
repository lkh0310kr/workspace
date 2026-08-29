//! GPU rendering — `wgpu` presenting directly into a real native window
//! surface handed to it by whatever shell owns the window (no offscreen
//! texture, no readback, no video). Nothing here is Qt-specific — any
//! future shell (a different native toolkit) can reuse this as-is.

use std::ffi::c_void;
use std::num::NonZeroIsize;
use std::ptr::NonNull;

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use raw_window_handle::{AppKitDisplayHandle, AppKitWindowHandle, RawDisplayHandle, RawWindowHandle};
#[cfg(target_os = "windows")]
use raw_window_handle::{Win32WindowHandle, WindowsDisplayHandle};

use crate::world::MeshKind;

pub const WIDTH: u32 = 900;
pub const HEIGHT: u32 = 600;

/// Orbit camera. Drag rotates around the origin; wheel zooms — driven by
/// whatever real input the shell forwards (see `world-engine-qt-shell`'s
/// `on_input`).
pub struct Camera {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
}

impl Camera {
    pub fn eye(&self) -> Vec3 {
        let (sy, cy) = self.yaw.sin_cos();
        let (sp, cp) = self.pitch.sin_cos();
        Vec3::new(self.distance * cp * cy, self.distance * sp, self.distance * cp * sy)
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Vertex {
    pub pos: [f32; 3],
    pub normal: [f32; 3],
    pub color: [f32; 3],
}

pub fn cube_geometry() -> (Vec<Vertex>, Vec<u16>) {
    fn face(p0: [f32; 3], p1: [f32; 3], p2: [f32; 3], p3: [f32; 3], n: [f32; 3], c: [f32; 3]) -> [Vertex; 4] {
        [
            Vertex { pos: p0, normal: n, color: c },
            Vertex { pos: p1, normal: n, color: c },
            Vertex { pos: p2, normal: n, color: c },
            Vertex { pos: p3, normal: n, color: c },
        ]
    }
    let h = 0.5_f32;
    let faces = [
        face([-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0.0, 0.0, 1.0], [0.9, 0.2, 0.2]),
        face([-h, h, -h], [h, h, -h], [h, -h, -h], [-h, -h, -h], [0.0, 0.0, -1.0], [0.2, 0.9, 0.2]),
        face([h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h], [1.0, 0.0, 0.0], [0.2, 0.2, 0.9]),
        face([-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h], [-1.0, 0.0, 0.0], [0.9, 0.9, 0.2]),
        face([h, h, -h], [-h, h, -h], [-h, h, h], [h, h, h], [0.0, 1.0, 0.0], [0.2, 0.9, 0.9]),
        face([h, -h, h], [-h, -h, h], [-h, -h, -h], [h, -h, -h], [0.0, -1.0, 0.0], [0.9, 0.2, 0.9]),
    ];
    let mut vertices = Vec::with_capacity(24);
    let mut indices = Vec::with_capacity(36);
    for f in faces {
        let base = vertices.len() as u16;
        vertices.extend_from_slice(&f);
        indices.extend_from_slice(&[base, base + 1, base + 2, base + 2, base + 3, base]);
    }
    (vertices, indices)
}

/// A flat quad matching the physics ground collider (cuboid half-extents
/// 50×0.1×50, centered at the origin) — until this existed, entities fell
/// out of the render entirely once past frame edge with nothing to show
/// what they were landing on.
pub fn ground_geometry() -> (Vec<Vertex>, Vec<u16>) {
    let half = 50.0_f32;
    let y = 0.1_f32;
    let color = [0.18, 0.2, 0.24];
    let normal = [0.0, 1.0, 0.0];
    let vertices = vec![
        Vertex { pos: [-half, y, -half], normal, color },
        Vertex { pos: [half, y, -half], normal, color },
        Vertex { pos: [half, y, half], normal, color },
        Vertex { pos: [-half, y, half], normal, color },
    ];
    // Why (found via a real live-QA report, not assumed): with wgpu's
    // default CCW front-face + our Face::Back culling, [0,1,2,2,3,0] is
    // front-facing as seen from *below* the XZ plane and back-facing
    // (culled) from above — invisible from the camera's normal viewing
    // angle, only visible if you orbit underneath it. Reversed to
    // [0,2,1,2,0,3] so it's front-facing from above instead.
    (vertices, vec![0, 2, 1, 2, 0, 3])
}

/// A small procedural UV sphere (radius 0.5, matching the cube's default
/// half-extent scale) — the well-known LearnOpenGL-style generation
/// formula (right-handed, Y-up, CCW-front-face-outward), used as-is
/// rather than re-derived by hand, given the ground plane's winding bug
/// found via live QA just before this. 12×8 segments — enough to read
/// clearly as a sphere, not photoreal.
pub fn sphere_geometry() -> (Vec<Vertex>, Vec<u16>) {
    const SLICES: u16 = 12;
    const STACKS: u16 = 8;
    const RADIUS: f32 = 0.5;
    let color = [0.9, 0.2, 0.2];

    let mut vertices = Vec::with_capacity(((SLICES + 1) * (STACKS + 1)) as usize);
    for y in 0..=STACKS {
        let y_segment = y as f32 / STACKS as f32;
        for x in 0..=SLICES {
            let x_segment = x as f32 / SLICES as f32;
            let theta = x_segment * std::f32::consts::TAU;
            let phi = y_segment * std::f32::consts::PI;
            let (sin_phi, cos_phi) = phi.sin_cos();
            let (sin_theta, cos_theta) = theta.sin_cos();
            let normal = [cos_theta * sin_phi, cos_phi, sin_theta * sin_phi];
            let pos = [normal[0] * RADIUS, normal[1] * RADIUS, normal[2] * RADIUS];
            vertices.push(Vertex { pos, normal, color });
        }
    }

    let mut indices = Vec::new();
    let row_len = SLICES + 1;
    for y in 0..STACKS {
        for x in 0..SLICES {
            let i0 = y * row_len + x;
            let i1 = (y + 1) * row_len + x;
            let i2 = (y + 1) * row_len + x + 1;
            let i3 = y * row_len + x + 1;
            indices.extend_from_slice(&[i0, i1, i2, i0, i2, i3]);
        }
    }
    (vertices, indices)
}

/// Loads the first primitive of the first mesh in a glTF/GLB file —
/// positions, normals, indices only (no materials/textures/skinning/
/// animation, real future scope). Vertex color is a flat mid-gray; the
/// per-entity `tint` uniform (see `render_frame`) does the actual
/// coloring, same as the built-in cube.
/// Returns (vertices, indices, collider half-extents) — the half-extents
/// are the mesh's actual bounding-box half-size, computed from its raw
/// positions before they're consumed into `Vertex`es. Used so every
/// entity's collider in a mesh-driven scene is sized to match what's
/// actually rendered, instead of a hardcoded default cuboid.
pub fn load_mesh(path: &std::path::Path) -> anyhow::Result<(Vec<Vertex>, Vec<u16>, [f32; 3])> {
    let (document, buffers, _images) = gltf::import(path)?;
    let mesh = document
        .meshes()
        .next()
        .ok_or_else(|| anyhow::anyhow!("{path:?} has no meshes"))?;
    let primitive = mesh
        .primitives()
        .next()
        .ok_or_else(|| anyhow::anyhow!("{path:?}'s first mesh has no primitives"))?;
    let reader = primitive.reader(|buffer| buffers.get(buffer.index()).map(|data| &data.0[..]));
    let positions: Vec<[f32; 3]> = reader
        .read_positions()
        .ok_or_else(|| anyhow::anyhow!("{path:?}'s primitive has no POSITION attribute"))?
        .collect();
    let normals: Vec<[f32; 3]> = match reader.read_normals() {
        Some(iter) => iter.collect(),
        // Flat gray fallback normal — not geometrically correct, but
        // this v0 has no flat-shading-from-face-winding fallback either;
        // real per-face normal generation is future scope.
        None => vec![[0.0, 1.0, 0.0]; positions.len()],
    };
    let indices: Vec<u16> = match reader.read_indices() {
        Some(indices) => indices
            .into_u32()
            .map(|i| u16::try_from(i).map_err(|_| anyhow::anyhow!("{path:?} has more than 65535 vertices — not supported yet")))
            .collect::<anyhow::Result<Vec<u16>>>()?,
        None => (0..positions.len() as u16).collect(),
    };
    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for p in &positions {
        for i in 0..3 {
            min[i] = min[i].min(p[i]);
            max[i] = max[i].max(p[i]);
        }
    }
    let half_extents = [(max[0] - min[0]) / 2.0, (max[1] - min[1]) / 2.0, (max[2] - min[2]) / 2.0];

    let color = [0.75, 0.75, 0.78];
    let vertices = positions
        .into_iter()
        .zip(normals)
        .map(|(pos, normal)| Vertex { pos, normal, color })
        .collect();
    Ok((vertices, indices, half_extents))
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms {
    mvp: [[f32; 4]; 4],
    model: [[f32; 4]; 4],
    light_dir: [f32; 4],
    tint: [f32; 4],
}

pub struct Mesh {
    vertex_buf: wgpu::Buffer,
    index_buf: wgpu::Buffer,
    index_count: u32,
}

pub fn upload_mesh(device: &wgpu::Device, queue: &wgpu::Queue, label: &str, vertices: &[Vertex], indices: &[u16]) -> Mesh {
    let vertex_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(&format!("{label}-vertices")),
        size: (vertices.len() * std::mem::size_of::<Vertex>()) as u64,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&vertex_buf, 0, bytemuck::cast_slice(vertices));
    let index_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(&format!("{label}-indices")),
        size: (indices.len() * std::mem::size_of::<u16>()) as u64,
        usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&index_buf, 0, bytemuck::cast_slice(indices));
    Mesh { vertex_buf, index_buf, index_count: indices.len() as u32 }
}

pub struct GpuContext {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_format: wgpu::TextureFormat,
    surface_width: u32,
    surface_height: u32,
    pipeline: wgpu::RenderPipeline,
    uniform_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    ground_mesh: Mesh,
    cube_mesh: Mesh,
    sphere_mesh: Mesh,
    loaded_mesh: Option<Mesh>,
    depth_view: wgpu::TextureView,
}

/// Builds a `wgpu` surface directly targeting a real native AppKit view
/// (`NSView*`) at the crate's default size — used by `world-engine-qt-shell`.
pub fn init_gpu(native_view: *mut c_void, loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)>) -> GpuContext {
    init_gpu_sized(native_view, WIDTH, HEIGHT, loaded_geometry)
}

/// Same as [`init_gpu`] but with an explicit pixel size — used by in-process
/// Electron embed panes that may not match the Qt shell's default window size.
pub fn init_gpu_sized(
    native_view: *mut c_void,
    width: u32,
    height: u32,
    loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)>,
) -> GpuContext {
    let raw_window_handle =
        RawWindowHandle::AppKit(AppKitWindowHandle::new(NonNull::new(native_view).expect("shell gave a null native view")));
    let raw_display_handle = RawDisplayHandle::AppKit(AppKitDisplayHandle::new());
    create_gpu_context(raw_window_handle, Some(raw_display_handle), width, height, loaded_geometry)
}

/// Windows: build a `wgpu` surface from a child `HWND` (Electron embed).
#[cfg(target_os = "windows")]
pub fn init_gpu_win32(
    hwnd: *mut c_void,
    width: u32,
    height: u32,
    loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)>,
) -> GpuContext {
    let hwnd = NonZeroIsize::new(hwnd as isize).expect("embed host HWND was null");
    let raw_window_handle = RawWindowHandle::Win32(Win32WindowHandle::new(hwnd));
    let raw_display_handle = RawDisplayHandle::Windows(WindowsDisplayHandle::new());
    create_gpu_context(raw_window_handle, Some(raw_display_handle), width, height, loaded_geometry)
}

fn create_gpu_context(
    raw_window_handle: RawWindowHandle,
    raw_display_handle: Option<RawDisplayHandle>,
    width: u32,
    height: u32,
    loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)>,
) -> GpuContext {
    let instance = wgpu::Instance::default();
    // Safety: caller guarantees the native handle outlives this GpuContext.
    let surface = unsafe {
        instance
            .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::RawHandle {
                raw_display_handle,
                raw_window_handle,
            })
            .expect("failed to create wgpu surface from native view/HWND")
    };

    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        compatible_surface: Some(&surface),
        ..Default::default()
    }))
    .expect("no wgpu adapter available");
    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: None,
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults(),
        experimental_features: wgpu::ExperimentalFeatures::disabled(),
        memory_hints: wgpu::MemoryHints::MemoryUsage,
        trace: wgpu::Trace::Off,
    }))
    .expect("failed to get wgpu device");

    let surface_caps = surface.get_capabilities(&adapter);
    let surface_format = surface_caps.formats[0];
    surface.configure(
        &device,
        &wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width,
            height,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: surface_caps.alpha_modes[0],
            color_space: Default::default(),
            view_formats: vec![],
        },
    );

    let shader = device.create_shader_module(wgpu::include_wgsl!("shader.wgsl"));
    let (cube_vertices, cube_indices) = cube_geometry();
    let cube_mesh = upload_mesh(&device, &queue, "cube", &cube_vertices, &cube_indices);
    let (sphere_vertices, sphere_indices) = sphere_geometry();
    let sphere_mesh = upload_mesh(&device, &queue, "sphere", &sphere_vertices, &sphere_indices);
    let loaded_mesh = loaded_geometry.map(|(vertices, indices)| upload_mesh(&device, &queue, "loaded", &vertices, &indices));
    let (ground_vertices, ground_indices) = ground_geometry();
    let ground_mesh = upload_mesh(&device, &queue, "ground", &ground_vertices, &ground_indices);

    let uniform_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("uniforms"),
        size: std::mem::size_of::<Uniforms>() as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
            ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
            count: None,
        }],
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &bind_group_layout,
        entries: &[wgpu::BindGroupEntry { binding: 0, resource: uniform_buf.as_entire_binding() }],
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(&bind_group_layout)],
        immediate_size: 0,
    });

    let vertex_layout = wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[
            wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x3, offset: 0, shader_location: 0 },
            wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x3, offset: 12, shader_location: 1 },
            wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x3, offset: 24, shader_location: 2 },
        ],
    };
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: None,
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState { module: &shader, entry_point: Some("vs_main"), compilation_options: Default::default(), buffers: &[Some(vertex_layout)] },
        fragment: Some(wgpu::FragmentState { module: &shader, entry_point: Some("fs_main"), compilation_options: Default::default(), targets: &[Some(surface_format.into())] }),
        primitive: wgpu::PrimitiveState { cull_mode: Some(wgpu::Face::Back), ..Default::default() },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::Less),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    });

    let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("depth"),
        size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());

    GpuContext {
        device,
        queue,
        surface,
        surface_format,
        surface_width: width,
        surface_height: height,
        pipeline,
        uniform_buf,
        bind_group,
        ground_mesh,
        cube_mesh,
        sphere_mesh,
        loaded_mesh,
        depth_view,
    }
}

pub fn render_frame(gpu: &GpuContext, draw_list: &[(Mat4, Vec3, MeshKind)], camera: &Camera) {
    let aspect = gpu.surface_width as f32 / gpu.surface_height as f32;
    let projection = glam::camera::rh::proj::directx::perspective(45f32.to_radians(), aspect, 0.1, 100.0);
    let view = glam::camera::rh::view::look_at_mat4(camera.eye(), Vec3::ZERO, Vec3::Y);

    let frame = match gpu.surface.get_current_texture() {
        wgpu::CurrentSurfaceTexture::Success(frame) | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
        _ => return, // transient (occluded/outdated/lost/etc.) — skip this tick
    };
    let view_target = frame.texture.create_view(&wgpu::TextureViewDescriptor {
        format: Some(gpu.surface_format),
        ..Default::default()
    });

    // Ground first (fixed transform/tint/mesh), then every entity — one
    // draw per call, each its own submit. Simplest correct thing for a
    // v0 scene this small (a single shared uniform buffer can't safely
    // hold N different per-draw values within one command buffer without
    // a dynamic-offset binding, which this scale doesn't need yet). Only
    // the very first draw of the frame clears; the rest load.
    // Matches ground_geometry()'s intent — Vertex.color itself is unused
    // by the shader (see shader.wgsl's comment), only the tint uniform is.
    const GROUND_TINT: Vec3 = Vec3::new(0.18, 0.2, 0.24);
    let ground_draw = (Mat4::IDENTITY, GROUND_TINT, &gpu.ground_mesh);
    let entity_draws = draw_list.iter().map(|(model, tint, kind)| {
        let mesh = match kind {
            MeshKind::Cube => &gpu.cube_mesh,
            MeshKind::Sphere => &gpu.sphere_mesh,
            MeshKind::Loaded => gpu.loaded_mesh.as_ref().expect("MeshKind::Loaded entity exists but no mesh was loaded"),
        };
        (*model, *tint, mesh)
    });
    let all_draws = std::iter::once(ground_draw).chain(entity_draws);

    for (i, (model, tint, mesh)) in all_draws.enumerate() {
        let mvp = projection * view * model;
        let uniforms = Uniforms {
            mvp: mvp.to_cols_array_2d(),
            model: model.to_cols_array_2d(),
            light_dir: [0.4, 0.9, 0.3, 0.0],
            tint: [tint.x, tint.y, tint.z, 1.0],
        };
        gpu.queue.write_buffer(&gpu.uniform_buf, 0, bytemuck::bytes_of(&uniforms));

        let mut encoder = gpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        {
            let load_op = if i == 0 {
                wgpu::LoadOp::Clear(wgpu::Color { r: 0.05, g: 0.06, b: 0.09, a: 1.0 })
            } else {
                wgpu::LoadOp::Load
            };
            let depth_load_op = if i == 0 { wgpu::LoadOp::Clear(1.0) } else { wgpu::LoadOp::Load };
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view_target,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations { load: load_op, store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &gpu.depth_view,
                    depth_ops: Some(wgpu::Operations { load: depth_load_op, store: wgpu::StoreOp::Store }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            rpass.set_pipeline(&gpu.pipeline);
            rpass.set_bind_group(0, &gpu.bind_group, &[]);
            rpass.set_vertex_buffer(0, mesh.vertex_buf.slice(..));
            rpass.set_index_buffer(mesh.index_buf.slice(..), wgpu::IndexFormat::Uint16);
            rpass.draw_indexed(0..mesh.index_count, 0, 0..1);
        }
        gpu.queue.submit(Some(encoder.finish()));
    }
    gpu.queue.present(frame);
}
