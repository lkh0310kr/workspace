// World Engine — Qt shell, Phase 1 spike. See
// docs/architecture/09-future-native-architecture.md: after settling on
// "Qt (native, cross-platform) for World Engine's own UI, wgpu renders
// directly into a real native window — no Electron, no browser, no
// WebRTC/video for the local case." This crate is the smallest possible
// proof of that: a bare Qt window (cpp/shim.cpp — no QML, no moc) whose
// native view wgpu renders straight into every frame, showing the same
// physics-driven cube from world-engine-core (wgpu + rapier3d + hecs),
// reused as-is — only the GPU target (real surface vs. offscreen
// texture + WebRTC) and the driving loop (Qt's own QTimer vs. a tokio
// interval) changed.
//
// macOS only for now (see build.rs) — Windows/Linux Qt linking is a real
// follow-up, not attempted here.

use std::ffi::{c_int, c_void};
use std::ptr::NonNull;

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Quat, Vec3};
use rapier3d::prelude::*;
use raw_window_handle::{AppKitDisplayHandle, AppKitWindowHandle, RawDisplayHandle, RawWindowHandle};

const WIDTH: u32 = 900;
const HEIGHT: u32 = 600;

type InitCallback = extern "C" fn(*mut c_void, *mut c_void);
type FrameCallback = extern "C" fn(*mut c_void);

unsafe extern "C" {
    fn qt_run(width: c_int, height: c_int, init_cb: InitCallback, frame_cb: FrameCallback, user_data: *mut c_void);
}

// ── Cube geometry + uniforms (identical to world-engine-core) ──────────

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex {
    pos: [f32; 3],
    normal: [f32; 3],
    color: [f32; 3],
}

fn cube_geometry() -> (Vec<Vertex>, Vec<u16>) {
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

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms {
    mvp: [[f32; 4]; 4],
    model: [[f32; 4]; 4],
    light_dir: [f32; 4],
}

// ── Physics + ECS (identical shape to world-engine-core) ────────────────

struct Transform {
    translation: Vec3,
    rotation: Quat,
}
struct PhysicsBody(RigidBodyHandle);

struct World {
    ecs: hecs::World,
    rigid_body_set: RigidBodySet,
    collider_set: ColliderSet,
    integration_parameters: IntegrationParameters,
    physics_pipeline: PhysicsPipeline,
    island_manager: IslandManager,
    broad_phase: DefaultBroadPhase,
    narrow_phase: NarrowPhase,
    impulse_joint_set: ImpulseJointSet,
    multibody_joint_set: MultibodyJointSet,
    ccd_solver: CCDSolver,
    cube_entity: hecs::Entity,
}

impl World {
    fn new() -> Self {
        let mut rigid_body_set = RigidBodySet::new();
        let mut collider_set = ColliderSet::new();
        collider_set.insert(ColliderBuilder::cuboid(50.0, 0.1, 50.0).build());
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(Vec3::new(0.0, 2.5, 0.0))
            .rotation(Vec3::new(0.4, 0.6, 0.0))
            .build();
        let handle = rigid_body_set.insert(rigid_body);
        let collider = ColliderBuilder::cuboid(0.5, 0.5, 0.5).restitution(0.6).build();
        collider_set.insert_with_parent(collider, handle, &mut rigid_body_set);

        let mut ecs = hecs::World::new();
        let cube_entity = ecs.spawn((Transform { translation: Vec3::ZERO, rotation: Quat::IDENTITY }, PhysicsBody(handle)));

        Self {
            ecs,
            rigid_body_set,
            collider_set,
            integration_parameters: IntegrationParameters::default(),
            physics_pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            cube_entity,
        }
    }

    fn step(&mut self) {
        let gravity = Vec3::new(0.0, -9.81, 0.0);
        self.physics_pipeline.step(
            gravity,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            &(),
            &(),
        );
        let body_handle = self.ecs.get::<&PhysicsBody>(self.cube_entity).unwrap().0;
        let body = &self.rigid_body_set[body_handle];
        let t = body.translation();
        let r = body.rotation();
        let mut transform = self.ecs.get::<&mut Transform>(self.cube_entity).unwrap();
        transform.translation = t;
        transform.rotation = *r;
    }

    fn cube_model_matrix(&mut self) -> Mat4 {
        let transform = self.ecs.get::<&Transform>(self.cube_entity).unwrap();
        Mat4::from_rotation_translation(transform.rotation, transform.translation)
    }
}

// ── GPU: renders directly into the Qt window's native surface ──────────

struct GpuContext {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_format: wgpu::TextureFormat,
    pipeline: wgpu::RenderPipeline,
    uniform_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    vertex_buf: wgpu::Buffer,
    index_buf: wgpu::Buffer,
    index_count: u32,
    depth_view: wgpu::TextureView,
}

fn init_gpu(native_view: *mut c_void) -> GpuContext {
    let raw_window_handle = RawWindowHandle::AppKit(AppKitWindowHandle::new(NonNull::new(native_view).expect("Qt gave a null native view")));
    let raw_display_handle = RawDisplayHandle::AppKit(AppKitDisplayHandle::new());

    let instance = wgpu::Instance::default();
    // Safety: the NSView handed to us by cpp/shim.cpp stays alive for the
    // whole process lifetime (it belongs to the QWidget the Qt event
    // loop owns), which outlives this surface.
    let surface = unsafe {
        instance
            .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::RawHandle { raw_display_handle: Some(raw_display_handle), raw_window_handle })
            .expect("failed to create wgpu surface from Qt's native view")
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
            width: WIDTH,
            height: HEIGHT,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: surface_caps.alpha_modes[0],
            color_space: Default::default(),
            view_formats: vec![],
        },
    );

    let shader = device.create_shader_module(wgpu::include_wgsl!("shader.wgsl"));
    let (vertices, indices) = cube_geometry();
    let vertex_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("cube-vertices"),
        size: (vertices.len() * std::mem::size_of::<Vertex>()) as u64,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&vertex_buf, 0, bytemuck::cast_slice(&vertices));
    let index_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("cube-indices"),
        size: (indices.len() * std::mem::size_of::<u16>()) as u64,
        usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&index_buf, 0, bytemuck::cast_slice(&indices));

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
        size: wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 },
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
        pipeline,
        uniform_buf,
        bind_group,
        vertex_buf,
        index_buf,
        index_count: indices.len() as u32,
        depth_view,
    }
}

fn render_frame(gpu: &GpuContext, model: Mat4) {
    let aspect = WIDTH as f32 / HEIGHT as f32;
    let projection = glam::camera::rh::proj::directx::perspective(45f32.to_radians(), aspect, 0.1, 100.0);
    let eye = Vec3::new(4.0, 3.5, 6.0);
    let view = glam::camera::rh::view::look_at_mat4(eye, Vec3::ZERO, Vec3::Y);
    let mvp = projection * view * model;
    let uniforms = Uniforms { mvp: mvp.to_cols_array_2d(), model: model.to_cols_array_2d(), light_dir: [0.4, 0.9, 0.3, 0.0] };
    gpu.queue.write_buffer(&gpu.uniform_buf, 0, bytemuck::bytes_of(&uniforms));

    let frame = match gpu.surface.get_current_texture() {
        wgpu::CurrentSurfaceTexture::Success(frame) | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
        _ => return, // transient (occluded/outdated/lost/etc.) — skip this tick
    };
    let view_target = frame.texture.create_view(&wgpu::TextureViewDescriptor {
        format: Some(gpu.surface_format),
        ..Default::default()
    });

    let mut encoder = gpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    {
        let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view_target,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.05, g: 0.06, b: 0.09, a: 1.0 }), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &gpu.depth_view,
                depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        rpass.set_pipeline(&gpu.pipeline);
        rpass.set_bind_group(0, &gpu.bind_group, &[]);
        rpass.set_vertex_buffer(0, gpu.vertex_buf.slice(..));
        rpass.set_index_buffer(gpu.index_buf.slice(..), wgpu::IndexFormat::Uint16);
        rpass.draw_indexed(0..gpu.index_count, 0, 0..1);
    }
    gpu.queue.submit(Some(encoder.finish()));
    gpu.queue.present(frame);
}

// ── FFI glue ──────────────────────────────────────────────────────────

struct EngineState {
    world: World,
    gpu: Option<GpuContext>,
}

extern "C" fn on_init(native_view: *mut c_void, user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    state.gpu = Some(init_gpu(native_view));
    println!("wgpu surface created directly in the Qt window — Phase 1 spike live.");
}

extern "C" fn on_frame(user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    state.world.step();
    let model = state.world.cube_model_matrix();
    if let Some(gpu) = &state.gpu {
        render_frame(gpu, model);
    }
}

fn main() {
    let mut state = Box::new(EngineState { world: World::new(), gpu: None });
    let user_data = &mut *state as *mut EngineState as *mut c_void;
    println!("world-engine-qt-shell: Phase 1 — Qt native window, wgpu direct render, no Electron/WebRTC");
    unsafe {
        qt_run(WIDTH as c_int, HEIGHT as c_int, on_init, on_frame, user_data);
    }
}
