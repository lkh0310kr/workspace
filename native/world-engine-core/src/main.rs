// World Engine core v0 — see docs/architecture/09-future-native-architecture.md
// and the plan this was built from. A real engine assembled from proven
// open-source Rust libraries (not a reimplementation, not hosting a
// third-party engine): wgpu for GPU rendering, rapier3d for physics,
// hecs for ECS state — composed into one process, with its rendered
// output streamed over WebRTC using the same transport already proven in
// ../engine-stream-poc.
//
// v0 scope (see the plan's explicit non-goals): one hardcoded cube,
// dropped under real gravity by rapier3d, rendered with basic
// single-light shading via wgpu, offscreen (no OS window). No scene
// graph, no assets, no scripting, no hardware encoder, no input
// round-trip, no Electron wiring.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Quat, Vec3};
use openh264::encoder::{Encoder, EncoderConfig};
use openh264::formats::{RgbSliceU8, YUVBuffer};
use openh264::OpenH264API;
use rapier3d::prelude::*;
use rtc::interceptor::Registry;
use rtc::media::Sample;
use rtc::media_stream::MediaStreamTrack;
use rtc::peer_connection::configuration::interceptor_registry::register_default_interceptors;
use rtc::peer_connection::configuration::media_engine::{MediaEngine, MIME_TYPE_H264};
use rtc::peer_connection::configuration::RTCConfigurationBuilder;
use rtc::peer_connection::sdp::RTCSessionDescription;
use rtc::peer_connection::transport::RTCIceServer;
use rtc::rtp_transceiver::rtp_sender::{
    RTCRtpCodec, RTCRtpCodecParameters, RTCRtpCodingParameters, RTCRtpEncodingParameters,
    RtpCodecKind,
};
use warp::Filter;
use webrtc::media_stream::track_local::static_sample::TrackLocalStaticSample;
use webrtc::media_stream::track_local::TrackLocal;
use webrtc::peer_connection::{
    PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCIceGatheringState,
    RTCPeerConnectionState,
};
use webrtc::runtime::{channel, Sender};

const WIDTH: u32 = 640;
const HEIGHT: u32 = 360;
const FPS: u64 = 30;
const FRAME_DURATION: Duration = Duration::from_millis(1000 / FPS);
const SIGNALING_PORT: u16 = 8789;

// ── Cube geometry (flat-shaded: 4 duplicated vertices per face so each
// face gets its own normal and color) ──────────────────────────────────

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex {
    pos: [f32; 3],
    normal: [f32; 3],
    color: [f32; 3],
}

fn cube_geometry() -> (Vec<Vertex>, Vec<u16>) {
    fn face(
        p0: [f32; 3],
        p1: [f32; 3],
        p2: [f32; 3],
        p3: [f32; 3],
        n: [f32; 3],
        c: [f32; 3],
    ) -> [Vertex; 4] {
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

// ── wgpu offscreen render context ───────────────────────────────────────

struct GpuContext {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    uniform_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    vertex_buf: wgpu::Buffer,
    index_buf: wgpu::Buffer,
    index_count: u32,
    render_target: wgpu::Texture,
    staging_buffer: wgpu::Buffer,
    bytes_per_row: u32,
}

async fn init_gpu() -> Result<GpuContext> {
    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions::default())
        .await
        .map_err(|e| anyhow::anyhow!("no wgpu adapter available: {e}"))?;
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: None,
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            experimental_features: wgpu::ExperimentalFeatures::disabled(),
            memory_hints: wgpu::MemoryHints::MemoryUsage,
            trace: wgpu::Trace::Off,
        })
        .await?;

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
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buf.as_entire_binding(),
        }],
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(&bind_group_layout)],
        immediate_size: 0,
    });

    let render_format = wgpu::TextureFormat::Rgba8UnormSrgb;
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
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: Default::default(),
            buffers: &[Some(vertex_layout)],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: Default::default(),
            targets: &[Some(render_format.into())],
        }),
        primitive: wgpu::PrimitiveState {
            cull_mode: Some(wgpu::Face::Back),
            ..Default::default()
        },
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

    let render_target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("render-target"),
        size: wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: render_format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[render_format],
    });

    // WIDTH * 4 (RGBA8) = 2560, already a multiple of wgpu's 256-byte row
    // alignment requirement — no padding math needed.
    let bytes_per_row = WIDTH * 4;
    let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("readback"),
        size: (bytes_per_row * HEIGHT) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    Ok(GpuContext {
        device,
        queue,
        pipeline,
        uniform_buf,
        bind_group,
        vertex_buf,
        index_buf,
        index_count: indices.len() as u32,
        render_target,
        staging_buffer,
        bytes_per_row,
    })
}

/// Renders one frame with the given model transform and reads it back to
/// an RGB (not RGBA — openh264's RgbSliceU8 wants tightly-packed RGB)
/// byte buffer.
async fn render_frame(gpu: &GpuContext, model: Mat4) -> Result<Vec<u8>> {
    let aspect = WIDTH as f32 / HEIGHT as f32;
    let projection = glam::camera::rh::proj::directx::perspective(
        45f32.to_radians(),
        aspect,
        0.1,
        100.0,
    );
    let eye = Vec3::new(4.0, 3.5, 6.0);
    let view = glam::camera::rh::view::look_at_mat4(eye, Vec3::ZERO, Vec3::Y);
    let mvp = projection * view * model;

    let uniforms = Uniforms {
        mvp: mvp.to_cols_array_2d(),
        model: model.to_cols_array_2d(),
        light_dir: [0.4, 0.9, 0.3, 0.0],
    };
    gpu.queue
        .write_buffer(&gpu.uniform_buf, 0, bytemuck::bytes_of(&uniforms));

    let view_target = gpu
        .render_target
        .create_view(&wgpu::TextureViewDescriptor::default());
    let depth_texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
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

    let mut encoder = gpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    {
        let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view_target,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.05, g: 0.06, b: 0.09, a: 1.0 }),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &depth_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(1.0),
                    store: wgpu::StoreOp::Discard,
                }),
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
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &gpu.render_target,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &gpu.staging_buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(gpu.bytes_per_row),
                rows_per_image: Some(HEIGHT),
            },
        },
        wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 },
    );
    gpu.queue.submit(Some(encoder.finish()));

    let slice = gpu.staging_buffer.slice(..);
    let (tx, rx) = flume::bounded(1);
    slice.map_async(wgpu::MapMode::Read, move |r| {
        let _ = tx.send(r);
    });
    gpu.device.poll(wgpu::PollType::wait_indefinitely())?;
    rx.recv_async().await??;

    let mut rgb = Vec::with_capacity((WIDTH * HEIGHT * 3) as usize);
    {
        let mapped = slice.get_mapped_range()?;
        for row in mapped.chunks_exact(gpu.bytes_per_row as usize) {
            for px in row[..(WIDTH * 4) as usize].chunks_exact(4) {
                rgb.push(px[0]);
                rgb.push(px[1]);
                rgb.push(px[2]);
            }
        }
    }
    gpu.staging_buffer.unmap();

    Ok(rgb)
}

// ── ECS + physics ────────────────────────────────────────────────────────

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

        // Ground: a large flat static collider, no rigid body needed.
        collider_set.insert(ColliderBuilder::cuboid(50.0, 0.1, 50.0).build());

        // The cube: dynamic rigid body dropped from height, with real
        // restitution so it visibly bounces before settling. This rapier3d
        // build uses glam types directly (confirmed via a real compile
        // error, not assumed) — Vec3::new, not the nalgebra `vector!` macro.
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(Vec3::new(0.0, 2.5, 0.0))
            .rotation(Vec3::new(0.4, 0.6, 0.0))
            .build();
        let handle = rigid_body_set.insert(rigid_body);
        let collider = ColliderBuilder::cuboid(0.5, 0.5, 0.5)
            .restitution(0.6)
            .build();
        collider_set.insert_with_parent(collider, handle, &mut rigid_body_set);

        let mut ecs = hecs::World::new();
        let cube_entity = ecs.spawn((
            Transform { translation: Vec3::ZERO, rotation: Quat::IDENTITY },
            PhysicsBody(handle),
        ));

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

        // Copy the simulated rigid body transform into the ECS component —
        // rendering reads from the ECS, never from Rapier directly, so a
        // future non-physics-driven entity fits the same render path.
        let body_handle = self.ecs.get::<&PhysicsBody>(self.cube_entity).unwrap().0;
        let body = &self.rigid_body_set[body_handle];
        // This rapier3d build's translation()/rotation() already return
        // glam::Vec3/Quat directly (confirmed via compile error, not
        // assumed) — no nalgebra conversion needed.
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

// ── WebRTC signaling + streaming (same shape as ../engine-stream-poc,
// proven working there — duplicated rather than shared per the plan's
// explicit non-goal: extracting a shared crate is a later step, once
// there's real duplication pain, not preemptively) ──────────────────────

#[derive(Clone)]
struct Handler {
    gather_complete_tx: Sender<()>,
    connected_tx: Sender<()>,
}

#[async_trait::async_trait]
impl PeerConnectionEventHandler for Handler {
    async fn on_ice_gathering_state_change(&self, state: RTCIceGatheringState) {
        if state == RTCIceGatheringState::Complete {
            let _ = self.gather_complete_tx.try_send(());
        }
    }

    async fn on_connection_state_change(&self, state: RTCPeerConnectionState) {
        println!("peer connection state: {state}");
        if state == RTCPeerConnectionState::Connected {
            let _ = self.connected_tx.try_send(());
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    println!("world-engine-core: v0 — wgpu + rapier3d + hecs, streamed over WebRTC");
    println!("Open static/index.html in a browser (it POSTs to http://127.0.0.1:{SIGNALING_PORT}/offer)");

    let gpu = Arc::new(init_gpu().await?);

    let gpu_filter = warp::any().map(move || Arc::clone(&gpu));
    let offer_route = warp::path("offer")
        .and(warp::post())
        .and(warp::body::json())
        .and(gpu_filter)
        .and_then(handle_offer);

    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["POST"])
        .allow_headers(vec!["content-type"]);

    warp::serve(offer_route.with(cors))
        .run(([127, 0, 0, 1], SIGNALING_PORT))
        .await;

    Ok(())
}

async fn handle_offer(
    offer: RTCSessionDescription,
    gpu: Arc<GpuContext>,
) -> std::result::Result<impl warp::Reply, std::convert::Infallible> {
    match negotiate_and_stream(offer, gpu).await {
        Ok(answer) => Ok(warp::reply::json(&answer)),
        Err(err) => {
            eprintln!("offer handling failed: {err:#}");
            Ok(warp::reply::json(
                &serde_json::json!({ "error": err.to_string() }),
            ))
        }
    }
}

async fn negotiate_and_stream(
    offer: RTCSessionDescription,
    gpu: Arc<GpuContext>,
) -> Result<RTCSessionDescription> {
    let mut media_engine = MediaEngine::default();
    let video_codec = RTCRtpCodecParameters {
        rtp_codec: RTCRtpCodec {
            mime_type: MIME_TYPE_H264.to_owned(),
            clock_rate: 90000,
            channels: 0,
            sdp_fmtp_line: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"
                .to_owned(),
            rtcp_feedback: vec![],
        },
        payload_type: 102,
        ..Default::default()
    };
    media_engine.register_codec(video_codec.clone(), RtpCodecKind::Video)?;

    let registry = register_default_interceptors(Registry::new(), &mut media_engine)?;

    let config = RTCConfigurationBuilder::new()
        .with_ice_servers(vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }])
        .build();

    let (gather_complete_tx, mut gather_complete_rx) = channel::<()>(1);
    let (connected_tx, mut connected_rx) = channel::<()>(1);
    let handler = Arc::new(Handler { gather_complete_tx, connected_tx });

    let peer_connection = PeerConnectionBuilder::new()
        .with_configuration(config)
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .with_handler(handler)
        .with_udp_addrs(vec!["0.0.0.0:0".to_string()])
        .build()
        .await?;

    let ssrc = rand::random::<u32>();
    let video_track: Arc<TrackLocalStaticSample> = Arc::new(TrackLocalStaticSample::new(
        MediaStreamTrack::new(
            "world-engine-core-stream".to_owned(),
            "world-engine-core-track".to_owned(),
            "world-engine-core".to_owned(),
            RtpCodecKind::Video,
            vec![RTCRtpEncodingParameters {
                rtp_coding_parameters: RTCRtpCodingParameters {
                    ssrc: Some(ssrc),
                    ..Default::default()
                },
                codec: video_codec.rtp_codec.clone(),
                ..Default::default()
            }],
        ),
    )?);
    let sender = peer_connection
        .add_track(Arc::clone(&video_track) as Arc<dyn TrackLocal>)
        .await?;

    peer_connection.set_remote_description(offer).await?;
    let answer = peer_connection.create_answer(None).await?;
    peer_connection.set_local_description(answer).await?;
    let _ = gather_complete_rx.recv().await;

    let local_desc = peer_connection
        .local_description()
        .await
        .ok_or_else(|| anyhow::anyhow!("no local description after gathering"))?;

    // See engine-stream-poc's own note on this: must read the negotiated
    // payload type only after negotiation actually finishes, not right
    // after add_track() — that returned this sender's own pre-negotiation
    // default instead of what offer/answer settled on, and every frame
    // sent with the wrong PT was silently dropped receiver-side.
    let payload_type = sender
        .get_parameters()
        .await?
        .rtp_parameters
        .codecs
        .first()
        .map(|codec| codec.payload_type)
        .ok_or_else(|| anyhow::anyhow!("sender has no negotiated codec"))?;

    tokio::spawn(async move {
        if connected_rx.recv().await.is_none() {
            return;
        }
        println!("connected — streaming the simulated cube");
        if let Err(err) = stream_engine(video_track, ssrc, payload_type, gpu).await {
            eprintln!("frame streaming stopped: {err:#}");
        }
    });

    Ok(local_desc)
}

async fn stream_engine(
    track: Arc<TrackLocalStaticSample>,
    ssrc: u32,
    payload_type: rtc::rtp_transceiver::PayloadType,
    gpu: Arc<GpuContext>,
) -> Result<()> {
    let mut world = World::new();
    let mut encoder = Encoder::with_api_config(OpenH264API::from_source(), EncoderConfig::new())?;
    let mut ticker = tokio::time::interval(FRAME_DURATION);

    loop {
        ticker.tick().await;

        world.step();
        let model = world.cube_model_matrix();
        let rgb = render_frame(&gpu, model).await?;

        let data: Vec<u8> = {
            let yuv = YUVBuffer::from_rgb_source(RgbSliceU8::new(&rgb, (WIDTH as usize, HEIGHT as usize)));
            let bitstream = encoder.encode(&yuv)?;
            bitstream.to_vec()
        };

        track
            .sample_writer(ssrc, payload_type)
            .write_sample(&Sample {
                data: data.into(),
                duration: FRAME_DURATION,
                ..Default::default()
            })
            .await?;
    }
}
