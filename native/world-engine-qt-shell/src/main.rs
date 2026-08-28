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
use serde::Deserialize;

// ── Scene format — Phase "실제 프로젝트 연동": a project is a folder
// containing `world-engine.json` (its mere presence is what TreeView
// checks for, matching godot's project.godot precedent). Deliberately
// minimal — a flat list of cubes, each an independent dynamic rigid
// body — this proves project data genuinely drives the scene instead of
// the hardcoded single cube, without a real asset/mesh pipeline, which
// is real future scope, not this pass.
#[derive(Deserialize)]
struct SceneFile {
    #[serde(default)]
    entities: Vec<SceneEntityDef>,
    /// Optional path (relative to the project directory) to a .gltf/.glb
    /// file — its first mesh's first primitive replaces the built-in
    /// cube for every entity in this scene. Positions/normals/indices
    /// only (no materials/textures/skinning/animation — real future
    /// scope). Omitted entirely: falls back to the cube, zero regression
    /// for existing scenes.
    #[serde(default)]
    mesh: Option<String>,
    /// Real `rapier3d` joints connecting two entities by index into
    /// `entities` (0-based, in file order). Brand-new data — no existing
    /// fixture has this key, so (unlike `shape` on `SceneEntityDef`) a
    /// plain internally-tagged enum works fine here: there's no
    /// missing-tag-on-old-data problem to work around.
    #[serde(default)]
    joints: Vec<JointDef>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum JointDef {
    /// A hinge — locks all relative motion except rotation around `axis`
    /// (local-space, same for both bodies). `anchor1`/`anchor2` are the
    /// pivot point in each body's own local space — e.g. a pendulum sets
    /// `anchor2` above its dynamic body's center so gravity gives it a
    /// lever arm to swing on.
    Revolute {
        body1: usize,
        body2: usize,
        #[serde(default = "default_joint_axis")]
        axis: [f32; 3],
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
    },
    /// Welds two bodies together at their anchors — no relative motion at
    /// all (unlike parenting a shape to another shape, this is a real
    /// rapier3d constraint the solver enforces every step).
    Fixed {
        body1: usize,
        body2: usize,
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
    },
}

fn default_joint_axis() -> [f32; 3] {
    [0.0, 1.0, 0.0]
}

#[derive(Deserialize)]
struct SceneEntityDef {
    #[serde(default)]
    position: [f32; 3],
    #[serde(default)]
    rotation: [f32; 3],
    #[serde(default = "default_restitution")]
    restitution: f32,
    #[serde(default = "default_color")]
    color: [f32; 3],
    /// Real `rapier3d` body types, exposed as-is — see the "not this
    /// batch" note on `Kinematic`: the type is real and accepted, but
    /// nothing moves it frame-to-frame yet (scripted motion is real
    /// future scope), so it behaves like `Fixed` visually for now.
    #[serde(default)]
    body_type: BodyTypeDef,
    /// Ignored when the *scene* has a top-level `mesh` (Phase 7) — that
    /// case always uses a cuboid collider sized to the mesh's actual
    /// bounding box instead (see `main()`), not this per-entity shape.
    /// Plain optional fields rather than a tagged-enum `shape` object —
    /// serde's internally-tagged-enum-plus-`#[serde(default)]` combo
    /// doesn't degrade gracefully when the tag is entirely absent (every
    /// existing fixture has no `"shape"` key at all), so `resolved_shape()`
    /// below does the defaulting explicitly instead.
    shape: Option<String>,
    half_extents: Option<[f32; 3]>,
    radius: Option<f32>,
    /// Only meaningful on a `"kinematic"` `body_type` — makes it actually
    /// move instead of just sitting there like a fixed body (the gap
    /// called out as this batch's non-goal previously). A plain optional
    /// struct field, not a tagged enum, so it stays exempt from the
    /// missing-tag-on-old-data problem `resolved_shape()` works around.
    motion: Option<MotionDef>,
}

/// Simple sinusoidal oscillation along one axis, driven by the world's
/// running clock: `origin + axis.normalize() * amplitude *
/// sin(time * speed)`. Not a general animation/scripting system — real
/// future scope — just enough to make a kinematic body actually move.
#[derive(Deserialize, Clone, Copy)]
struct MotionDef {
    #[serde(default = "default_motion_axis")]
    axis: [f32; 3],
    #[serde(default = "default_motion_amplitude")]
    amplitude: f32,
    #[serde(default = "default_motion_speed")]
    speed: f32,
}

fn default_motion_axis() -> [f32; 3] {
    [0.0, 1.0, 0.0]
}

fn default_motion_amplitude() -> f32 {
    1.0
}

fn default_motion_speed() -> f32 {
    1.0
}

impl SceneEntityDef {
    fn resolved_shape(&self) -> ShapeDef {
        match self.shape.as_deref() {
            Some("sphere") => ShapeDef::Sphere { radius: self.radius.unwrap_or_else(default_radius) },
            _ => ShapeDef::Cuboid { half_extents: self.half_extents.unwrap_or_else(default_half_extents) },
        }
    }
}

fn default_restitution() -> f32 {
    0.6
}

fn default_color() -> [f32; 3] {
    [0.9, 0.2, 0.2]
}

#[derive(Deserialize, Default, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum BodyTypeDef {
    #[default]
    Dynamic,
    Fixed,
    Kinematic,
}

/// Not `Deserialize` directly — see `SceneEntityDef::resolved_shape()`
/// for why (the tagged-enum-plus-missing-tag combo doesn't degrade
/// gracefully for scenes with no `"shape"` key at all).
#[derive(Clone, Copy)]
enum ShapeDef {
    Cuboid { half_extents: [f32; 3] },
    Sphere { radius: f32 },
}

fn default_half_extents() -> [f32; 3] {
    [0.5, 0.5, 0.5]
}

fn default_radius() -> f32 {
    0.5
}

fn default_scene() -> SceneFile {
    // Same single falling/bouncing cube Phase 1-3 already shipped and
    // verified — launching with no project argument (e.g. the "Launch
    // World Engine (dev)" menu item) keeps behaving exactly as before.
    SceneFile {
        entities: vec![SceneEntityDef {
            position: [0.0, 2.5, 0.0],
            rotation: [0.4, 0.6, 0.0],
            restitution: 0.6,
            color: [0.9, 0.2, 0.2],
            body_type: BodyTypeDef::Dynamic,
            shape: None,
            half_extents: None,
            radius: None,
            motion: None,
        }],
        mesh: None,
        joints: vec![],
    }
}

fn load_scene(project_dir: &str) -> SceneFile {
    let path = std::path::Path::new(project_dir).join("world-engine.json");
    match std::fs::read_to_string(&path) {
        Ok(contents) => match serde_json::from_str::<SceneFile>(&contents) {
            Ok(scene) if !scene.entities.is_empty() => scene,
            Ok(_) => {
                eprintln!("{path:?} has no entities — using the default demo scene instead.");
                default_scene()
            }
            Err(err) => {
                eprintln!("failed to parse {path:?}: {err} — using the default demo scene instead.");
                default_scene()
            }
        },
        Err(err) => {
            eprintln!("no world-engine.json at {path:?} ({err}) — using the default demo scene instead.");
            default_scene()
        }
    }
}

const WIDTH: u32 = 900;
const HEIGHT: u32 = 600;

type InitCallback = extern "C" fn(*mut c_void, *mut c_void);
type FrameCallback = extern "C" fn(*mut c_void);
type InputCallback = extern "C" fn(c_int, f32, f32, f32, f32, *mut c_void);

unsafe extern "C" {
    fn qt_run(
        width: c_int,
        height: c_int,
        init_cb: InitCallback,
        frame_cb: FrameCallback,
        input_cb: InputCallback,
        user_data: *mut c_void,
    );
}

// Matches cpp/shim.h's InputEventType enum exactly.
const INPUT_MOUSE_DOWN: c_int = 0;
const INPUT_MOUSE_UP: c_int = 1;
const INPUT_MOUSE_DRAG: c_int = 2;
const INPUT_WHEEL: c_int = 3;

/// Orbit camera driven by real mouse input (Qt hands it to us natively —
/// no InteractionCoordinator-style overlay problem exists for a real
/// native window). Drag rotates around the origin; wheel zooms.
struct Camera {
    yaw: f32,
    pitch: f32,
    distance: f32,
}

impl Camera {
    fn eye(&self) -> Vec3 {
        let (sy, cy) = self.yaw.sin_cos();
        let (sp, cp) = self.pitch.sin_cos();
        Vec3::new(self.distance * cp * cy, self.distance * sp, self.distance * cp * sy)
    }
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

/// A flat quad matching the physics ground collider (cuboid half-extents
/// 50×0.1×50, centered at the origin) — until this existed, entities fell
/// out of the render entirely once past frame edge with nothing to show
/// what they were landing on.
fn ground_geometry() -> (Vec<Vertex>, Vec<u16>) {
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
fn sphere_geometry() -> (Vec<Vertex>, Vec<u16>) {
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
/// actually rendered, instead of the old hardcoded 0.5 cuboid (a real
/// mismatch found via live QA on Phase 7's own "Box" fixture).
fn load_mesh(path: &std::path::Path) -> anyhow::Result<(Vec<Vertex>, Vec<u16>, [f32; 3])> {
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

// ── Physics + ECS (identical shape to world-engine-core) ────────────────

struct Transform {
    translation: Vec3,
    rotation: Quat,
}
struct PhysicsBody(RigidBodyHandle);
struct Tint(Vec3);
/// Present only on entities with a `motion` field in the scene — drives a
/// kinematic body via `set_next_kinematic_translation` each step instead
/// of leaving it sitting there like a fixed body.
struct Motion {
    origin: Vec3,
    axis: Vec3,
    amplitude: f32,
    speed: f32,
}

/// Which uploaded `Mesh` in `GpuContext` this entity draws with — decided
/// once at scene-load time in `World::new()` from `mesh_half_extents`/
/// `resolved_shape()`, not re-decided per frame.
#[derive(Clone, Copy, PartialEq)]
enum MeshKind {
    Cube,
    Sphere,
    Loaded,
}
struct RenderMesh(MeshKind);

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
    cube_entities: Vec<hecs::Entity>,
    /// Running clock, advanced once per `step()` by the fixed physics
    /// timestep — drives `Motion`'s sinusoidal offset.
    time: f32,
}

impl World {
    /// `mesh_half_extents`: `Some` when the scene has a top-level `mesh`
    /// (Phase 7) — every entity's collider is then a cuboid sized to the
    /// loaded mesh's actual bounding box (computed once in `main()`) and
    /// rendered with the loaded mesh, ignoring per-entity `shape`
    /// entirely. `None`: each entity uses its own `resolved_shape()`
    /// (cuboid/sphere, real `rapier3d` shapes) for both collider and
    /// render geometry.
    fn new(scene: &SceneFile, mesh_half_extents: Option<[f32; 3]>) -> Self {
        let mut rigid_body_set = RigidBodySet::new();
        let mut collider_set = ColliderSet::new();
        collider_set.insert(ColliderBuilder::cuboid(50.0, 0.1, 50.0).build());

        let mut ecs = hecs::World::new();
        let mut cube_entities = Vec::with_capacity(scene.entities.len());
        // Indexed the same as scene.entities — lets JointDef's body1/body2
        // (plain 0-based indices into the scene file) find the real
        // rapier3d handle to join.
        let mut rigid_body_handles = Vec::with_capacity(scene.entities.len());
        for def in &scene.entities {
            let rigid_body_builder = match def.body_type {
                BodyTypeDef::Dynamic => RigidBodyBuilder::dynamic(),
                BodyTypeDef::Fixed => RigidBodyBuilder::fixed(),
                // Real, distinct rapier3d body type. Behaves like Fixed
                // unless the entity also has a `motion` field (see
                // Motion component below) — without one, nothing drives
                // its position frame-to-frame.
                BodyTypeDef::Kinematic => RigidBodyBuilder::kinematic_position_based(),
            };
            let rigid_body = rigid_body_builder
                .translation(Vec3::from(def.position))
                .rotation(Vec3::from(def.rotation))
                .build();
            let handle = rigid_body_set.insert(rigid_body);
            rigid_body_handles.push(handle);

            let (collider, mesh_kind) = if let Some(half_extents) = mesh_half_extents {
                let [hx, hy, hz] = half_extents;
                (ColliderBuilder::cuboid(hx, hy, hz), MeshKind::Loaded)
            } else {
                match def.resolved_shape() {
                    ShapeDef::Cuboid { half_extents: [hx, hy, hz] } => (ColliderBuilder::cuboid(hx, hy, hz), MeshKind::Cube),
                    ShapeDef::Sphere { radius } => (ColliderBuilder::ball(radius), MeshKind::Sphere),
                }
            };
            let collider = collider.restitution(def.restitution).build();
            collider_set.insert_with_parent(collider, handle, &mut rigid_body_set);
            let entity = ecs.spawn((
                Transform { translation: Vec3::ZERO, rotation: Quat::IDENTITY },
                PhysicsBody(handle),
                Tint(Vec3::from(def.color)),
                RenderMesh(mesh_kind),
            ));
            if let Some(motion) = def.motion {
                ecs.insert_one(
                    entity,
                    Motion { origin: Vec3::from(def.position), axis: Vec3::from(motion.axis), amplitude: motion.amplitude, speed: motion.speed },
                )
                .expect("entity was just spawned, must still exist");
            }
            cube_entities.push(entity);
        }

        let mut impulse_joint_set = ImpulseJointSet::new();
        for joint in &scene.joints {
            let (body1_idx, body2_idx) = match joint {
                JointDef::Revolute { body1, body2, .. } => (*body1, *body2),
                JointDef::Fixed { body1, body2, .. } => (*body1, *body2),
            };
            let (Some(&body1), Some(&body2)) = (rigid_body_handles.get(body1_idx), rigid_body_handles.get(body2_idx)) else {
                eprintln!("joint references out-of-range entity index ({body1_idx}, {body2_idx}) for {} entities — skipped.", rigid_body_handles.len());
                continue;
            };
            match joint {
                JointDef::Revolute { axis, anchor1, anchor2, .. } => {
                    let data = RevoluteJointBuilder::new(Vec3::from(*axis)).local_anchor1(Vec3::from(*anchor1)).local_anchor2(Vec3::from(*anchor2)).build();
                    impulse_joint_set.insert(body1, body2, data, true);
                }
                JointDef::Fixed { anchor1, anchor2, .. } => {
                    let data = FixedJointBuilder::new().local_anchor1(Vec3::from(*anchor1)).local_anchor2(Vec3::from(*anchor2)).build();
                    impulse_joint_set.insert(body1, body2, data, true);
                }
            }
        }

        Self {
            ecs,
            rigid_body_set,
            collider_set,
            integration_parameters: IntegrationParameters::default(),
            physics_pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            impulse_joint_set,
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            cube_entities,
            time: 0.0,
        }
    }

    fn step(&mut self) {
        self.time += self.integration_parameters.dt;
        // Scripted kinematic motion — set each Motion entity's target
        // position before the physics step, same pattern rapier3d's own
        // kinematic examples use (the pipeline consumes
        // set_next_kinematic_translation during this step, not the next).
        let mut kinematic_targets = Vec::new();
        for &entity in &self.cube_entities {
            if let Ok(motion) = self.ecs.get::<&Motion>(entity) {
                let body_handle = self.ecs.get::<&PhysicsBody>(entity).unwrap().0;
                let offset = motion.axis.normalize_or_zero() * motion.amplitude * (self.time * motion.speed).sin();
                kinematic_targets.push((body_handle, motion.origin + offset));
            }
        }
        for (handle, target) in kinematic_targets {
            self.rigid_body_set[handle].set_next_kinematic_translation(target);
        }

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
        for &entity in &self.cube_entities {
            let body_handle = self.ecs.get::<&PhysicsBody>(entity).unwrap().0;
            let body = &self.rigid_body_set[body_handle];
            let t = body.translation();
            let r = body.rotation();
            let mut transform = self.ecs.get::<&mut Transform>(entity).unwrap();
            transform.translation = t;
            transform.rotation = *r;
        }
    }

    /// (model matrix, tint, mesh kind) per entity, in a stable order —
    /// what `render_frame` actually draws each tick.
    fn draw_list(&self) -> Vec<(Mat4, Vec3, MeshKind)> {
        self.cube_entities
            .iter()
            .map(|&entity| {
                let transform = self.ecs.get::<&Transform>(entity).unwrap();
                let tint = self.ecs.get::<&Tint>(entity).unwrap();
                let mesh_kind = self.ecs.get::<&RenderMesh>(entity).unwrap().0;
                (Mat4::from_rotation_translation(transform.rotation, transform.translation), tint.0, mesh_kind)
            })
            .collect()
    }
}

// ── GPU: renders directly into the Qt window's native surface ──────────

struct Mesh {
    vertex_buf: wgpu::Buffer,
    index_buf: wgpu::Buffer,
    index_count: u32,
}

fn upload_mesh(device: &wgpu::Device, queue: &wgpu::Queue, label: &str, vertices: &[Vertex], indices: &[u16]) -> Mesh {
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

struct GpuContext {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_format: wgpu::TextureFormat,
    pipeline: wgpu::RenderPipeline,
    uniform_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    ground_mesh: Mesh,
    cube_mesh: Mesh,
    sphere_mesh: Mesh,
    loaded_mesh: Option<Mesh>,
    depth_view: wgpu::TextureView,
}

fn init_gpu(native_view: *mut c_void, loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)>) -> GpuContext {
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
        ground_mesh,
        cube_mesh,
        sphere_mesh,
        loaded_mesh,
        depth_view,
    }
}

fn render_frame(gpu: &GpuContext, draw_list: &[(Mat4, Vec3, MeshKind)], camera: &Camera) {
    let aspect = WIDTH as f32 / HEIGHT as f32;
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

// ── FFI glue ──────────────────────────────────────────────────────────

struct EngineState {
    world: World,
    gpu: Option<GpuContext>,
    camera: Camera,
    // Taken (replaced with None) the moment on_init consumes it —
    // GpuContext needs to own its own buffers, this is just the handoff
    // from main()'s scene-loading to init_gpu(). None means no scene
    // mesh was loaded (no project, no mesh field, or it failed to load).
    loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)>,
}

extern "C" fn on_init(native_view: *mut c_void, user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    let geometry = state.loaded_geometry.take();
    state.gpu = Some(init_gpu(native_view, geometry));
    println!("wgpu surface created directly in the Qt window.");
}

extern "C" fn on_frame(user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    state.world.step();
    let draw_list = state.world.draw_list();
    if let Some(gpu) = &state.gpu {
        render_frame(gpu, &draw_list, &state.camera);
    }
}

/// Drag orbits, wheel zooms — see cpp/shim.cpp for what actually
/// generates these (real Qt mouse/wheel events, not simulated).
extern "C" fn on_input(event_type: c_int, _x: f32, _y: f32, dx: f32, dy: f32, user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    const ORBIT_SPEED: f32 = 0.01;
    const ZOOM_SPEED: f32 = 0.01;
    const MIN_DISTANCE: f32 = 2.0;
    const MAX_DISTANCE: f32 = 40.0;
    const MAX_PITCH: f32 = std::f32::consts::FRAC_PI_2 - 0.05;

    match event_type {
        INPUT_MOUSE_DRAG => {
            // Why (found via a real live-QA report, not assumed): this was
            // `-=`, which felt backwards on a real macOS trackpad —
            // dragging right orbited the camera the "wrong" way relative
            // to how the scene visually moved. Flipped to `+=` to match
            // natural drag-to-orbit feel.
            state.camera.yaw += dx * ORBIT_SPEED;
            state.camera.pitch = (state.camera.pitch + dy * ORBIT_SPEED).clamp(-MAX_PITCH, MAX_PITCH);
        }
        INPUT_WHEEL => {
            state.camera.distance = (state.camera.distance - dy * ZOOM_SPEED).clamp(MIN_DISTANCE, MAX_DISTANCE);
        }
        INPUT_MOUSE_DOWN | INPUT_MOUSE_UP => {}
        _ => {}
    }
}

fn main() {
    // Optional first CLI arg: a project directory containing
    // world-engine.json. No arg (e.g. the app-menu "Launch World Engine
    // (dev)" trigger) keeps the original single-cube demo behavior.
    let project_dir = std::env::args().nth(1);
    let scene = match &project_dir {
        Some(dir) => load_scene(dir),
        None => default_scene(),
    };

    // scene.mesh, if present, is relative to the project directory —
    // load it once here; on_init() falls back to the built-in cube/sphere
    // if this is None (no project, or no mesh specified, or it failed to
    // load — a broken mesh reference shouldn't crash the whole engine).
    // mesh_half_extents is the loaded mesh's own AABB, used to size every
    // entity's collider to actually match the mesh instead of a hardcoded
    // 0.5 cuboid (the bug found live in Phase 7).
    let mut loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)> = None;
    let mut mesh_half_extents: Option<[f32; 3]> = None;
    if let (Some(dir), Some(mesh_rel)) = (&project_dir, &scene.mesh) {
        let mesh_path = std::path::Path::new(dir).join(mesh_rel);
        match load_mesh(&mesh_path) {
            Ok((vertices, indices, half_extents)) => {
                loaded_geometry = Some((vertices, indices));
                mesh_half_extents = Some(half_extents);
            }
            Err(err) => {
                eprintln!("failed to load mesh {mesh_path:?}: {err:#} — using the built-in cube instead.");
            }
        }
    }

    let initial_eye = Vec3::new(4.0, 3.5, 6.0);
    let camera = Camera {
        yaw: initial_eye.z.atan2(initial_eye.x),
        pitch: (initial_eye.y / initial_eye.length()).asin(),
        distance: initial_eye.length(),
    };
    let mut state = Box::new(EngineState { world: World::new(&scene, mesh_half_extents), gpu: None, camera, loaded_geometry });
    let user_data = &mut *state as *mut EngineState as *mut c_void;
    println!("world-engine-qt-shell: Qt native window, wgpu direct render, {} entities", state.world.cube_entities.len());
    unsafe {
        qt_run(WIDTH as c_int, HEIGHT as c_int, on_init, on_frame, on_input, user_data);
    }
}
