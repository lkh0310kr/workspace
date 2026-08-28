// World Engine — Phase 2: true in-process embedding into an Electron
// window. See docs/architecture/09-future-native-architecture.md. This
// is a native Node addon (napi-rs) loaded directly into Electron's own
// process — not a separate binary like world-engine-qt-shell (Phase 1).
// Electron hands us its real NSView via getNativeWindowHandle(); we
// create our own NSView as a subview of it and wgpu renders directly
// into that subview, in-process, every frame. No IPC frame transfer, no
// video, no separate window. Reuses the exact same physics/render code
// as world-engine-core / world-engine-qt-shell — only the "where does
// wgpu present to" and "what drives the frame loop" pieces change.
//
// macOS only (objc2-app-kit) — Windows/Linux embedding is real follow-up
// work, not attempted here. Input forwarding is *not* solved by this
// crate either — see the doc's own "one real open question" note; this
// proves the visual embedding only.

use std::ptr::NonNull;
use std::thread;

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Quat, Vec3};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSView, NSWindowOrderingMode};
use rapier3d::prelude::*;

// ── Cube geometry + uniforms (identical to world-engine-core/qt-shell) ──

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

// ── Physics + ECS (identical shape to world-engine-core/qt-shell) ───────

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

// ── GPU: renders directly into our NSView, embedded in Electron's window ─

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
    width: u32,
    height: u32,
}

// Safety: this crate drives wgpu from a single dedicated render thread
// (see spawn in `init`) — the NSView pointer embedded in the surface is
// never touched from another thread after creation.
unsafe impl Send for GpuContext {}

fn init_gpu(view_ptr: *mut std::ffi::c_void, width: u32, height: u32) -> GpuContext {
    let raw_window_handle = raw_window_handle::RawWindowHandle::AppKit(
        raw_window_handle::AppKitWindowHandle::new(NonNull::new(view_ptr).expect("embedded NSView pointer was null")),
    );
    let raw_display_handle = raw_window_handle::RawDisplayHandle::AppKit(raw_window_handle::AppKitDisplayHandle::new());

    let instance = wgpu::Instance::default();
    let surface = unsafe {
        instance
            .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::RawHandle { raw_display_handle: Some(raw_display_handle), raw_window_handle })
            .expect("failed to create wgpu surface from embedded NSView")
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
        size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());

    GpuContext { device, queue, surface, surface_format, pipeline, uniform_buf, bind_group, vertex_buf, index_buf, index_count: indices.len() as u32, depth_view, width, height }
}

fn render_frame(gpu: &GpuContext, model: Mat4) {
    let aspect = gpu.width as f32 / gpu.height as f32;
    let projection = glam::camera::rh::proj::directx::perspective(45f32.to_radians(), aspect, 0.1, 100.0);
    let eye = Vec3::new(4.0, 3.5, 6.0);
    let view = glam::camera::rh::view::look_at_mat4(eye, Vec3::ZERO, Vec3::Y);
    let mvp = projection * view * model;
    let uniforms = Uniforms { mvp: mvp.to_cols_array_2d(), model: model.to_cols_array_2d(), light_dir: [0.4, 0.9, 0.3, 0.0] };
    gpu.queue.write_buffer(&gpu.uniform_buf, 0, bytemuck::bytes_of(&uniforms));

    let frame = match gpu.surface.get_current_texture() {
        wgpu::CurrentSurfaceTexture::Success(frame) | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
        _ => return,
    };
    let view_target = frame.texture.create_view(&wgpu::TextureViewDescriptor { format: Some(gpu.surface_format), ..Default::default() });
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

// ── napi entry point ─────────────────────────────────────────────────

/// Called from Electron's main process with `mainWindow.getNativeWindowHandle()`
/// (an 8-byte little-endian NSView* on macOS) plus the pane's pixel size.
/// Creates our own NSView, adds it as a subview of Electron's content
/// view, and spawns a dedicated thread that steps physics and renders
/// directly into it every frame — in-process, no IPC, no video.
#[napi]
pub fn start_embedded_engine(native_window_handle: Buffer, width: u32, height: u32) -> Result<()> {
    let bytes: &[u8] = &native_window_handle;
    if bytes.len() < 8 {
        return Err(Error::from_reason("expected an 8-byte native window handle"));
    }
    let electron_view_ptr = u64::from_le_bytes(bytes[..8].try_into().unwrap()) as *mut std::ffi::c_void;

    let mtm = MainThreadMarker::new().ok_or_else(|| Error::from_reason("start_embedded_engine must be called from Electron's main (UI) thread"))?;

    let electron_view: Retained<NSView> =
        unsafe { Retained::retain(electron_view_ptr.cast()) }.ok_or_else(|| Error::from_reason("Electron's native window handle was null/invalid"))?;

    let our_view = NSView::new(mtm);
    our_view.setFrame(electron_view.frame());
    electron_view.addSubview_positioned_relativeTo(&our_view, NSWindowOrderingMode::Below, None);

    // wgpu's AppKit surface setup (raw-window-metal, internally) mutates
    // the NSView (wantsLayer / assigning its CAMetalLayer) — do that on
    // the main thread, same as the addSubview call above, since AppKit
    // view mutation off the main thread is unsafe in general even though
    // the *drawing* that follows is fine from a background thread (the
    // standard, documented Metal pattern). Only the render loop itself
    // — physics + draw calls into an already-configured CAMetalLayer —
    // moves to a dedicated thread.
    let view_ptr = Retained::as_ptr(&our_view).cast_mut() as *mut std::ffi::c_void;
    let gpu = init_gpu(view_ptr, width, height);

    thread::Builder::new()
        .name("world-engine-render".into())
        .spawn(move || {
            let mut world = World::new();
            loop {
                world.step();
                let model = world.cube_model_matrix();
                render_frame(&gpu, model);
                thread::sleep(std::time::Duration::from_millis(33));
            }
        })
        .map_err(|e| Error::from_reason(format!("failed to spawn render thread: {e}")))?;

    Ok(())
}
