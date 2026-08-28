//! JSON scene format (`world-engine.json`) — one convenience way to build
//! a `World` from data, layered entirely on top of `crate::world`'s real
//! spawn API (`build_world` below just parses JSON then calls
//! `World::spawn`/`add_motion`/`add_joint` in a loop). Not a parallel
//! hardcoded implementation — hand-written game code and JSON-declared
//! scenes go through the exact same `World` methods.

use glam::Vec3;
use serde::Deserialize;

use crate::world::{BodyType, EntitySpec, JointKind, MeshKind, Shape, World};

#[derive(Deserialize)]
pub struct SceneFile {
    #[serde(default)]
    pub entities: Vec<SceneEntityDef>,
    /// Optional path (relative to the project directory) to a .gltf/.glb
    /// file — its first mesh's first primitive replaces the built-in
    /// cube for every entity in this scene. Positions/normals/indices
    /// only (no materials/textures/skinning/animation — real future
    /// scope). Omitted entirely: falls back to the cube, zero regression
    /// for existing scenes.
    #[serde(default)]
    pub mesh: Option<String>,
    /// Real `rapier3d` joints connecting two entities by index into
    /// `entities` (0-based, in file order). Brand-new data — no existing
    /// fixture has this key, so (unlike `shape` on `SceneEntityDef`) a
    /// plain internally-tagged enum works fine here: there's no
    /// missing-tag-on-old-data problem to work around.
    #[serde(default)]
    pub joints: Vec<JointDef>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum JointDef {
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
pub struct SceneEntityDef {
    #[serde(default)]
    pub position: [f32; 3],
    #[serde(default)]
    pub rotation: [f32; 3],
    #[serde(default = "default_restitution")]
    pub restitution: f32,
    #[serde(default = "default_color")]
    pub color: [f32; 3],
    #[serde(default)]
    pub body_type: BodyTypeDef,
    /// Ignored when the *scene* has a top-level `mesh` — that case always
    /// uses a cuboid collider sized to the mesh's actual bounding box
    /// instead (see `build_world`), not this per-entity shape. Plain
    /// optional fields rather than a tagged-enum `shape` object — serde's
    /// internally-tagged-enum-plus-`#[serde(default)]` combo doesn't
    /// degrade gracefully when the tag is entirely absent (every existing
    /// fixture has no `"shape"` key at all), so `resolved_shape()` below
    /// does the defaulting explicitly instead.
    pub shape: Option<String>,
    pub half_extents: Option<[f32; 3]>,
    pub radius: Option<f32>,
    /// Only meaningful on a `"kinematic"` `body_type` — makes it actually
    /// move via `World::add_motion` instead of sitting there like a fixed
    /// body.
    pub motion: Option<MotionDef>,
}

/// Simple sinusoidal oscillation along one axis — see `World::add_motion`.
#[derive(Deserialize, Clone, Copy)]
pub struct MotionDef {
    #[serde(default = "default_motion_axis")]
    pub axis: [f32; 3],
    #[serde(default = "default_motion_amplitude")]
    pub amplitude: f32,
    #[serde(default = "default_motion_speed")]
    pub speed: f32,
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
    fn resolved_shape(&self) -> Shape {
        match self.shape.as_deref() {
            Some("sphere") => Shape::Sphere { radius: self.radius.unwrap_or_else(default_radius) },
            _ => Shape::Cuboid { half_extents: Vec3::from(self.half_extents.unwrap_or_else(default_half_extents)) },
        }
    }

    fn resolved_body_type(&self) -> BodyType {
        match self.body_type {
            BodyTypeDef::Dynamic => BodyType::Dynamic,
            BodyTypeDef::Fixed => BodyType::Fixed,
            BodyTypeDef::Kinematic => BodyType::Kinematic,
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
pub enum BodyTypeDef {
    #[default]
    Dynamic,
    Fixed,
    Kinematic,
}

fn default_half_extents() -> [f32; 3] {
    [0.5, 0.5, 0.5]
}

fn default_radius() -> f32 {
    0.5
}

pub fn default_scene() -> SceneFile {
    // Single falling/bouncing cube — launching with no project argument
    // (e.g. the "Launch World Engine (dev)" menu item) keeps behaving
    // exactly as it always has.
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

pub fn load_scene(project_dir: &str) -> SceneFile {
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

/// Builds a real `World` from parsed scene data — a thin loop over
/// `World::spawn`/`add_motion`/`add_joint`, not a separate
/// implementation. `mesh_half_extents`: `Some` when the scene has a
/// top-level `mesh` — every entity's collider is then a cuboid sized to
/// the loaded mesh's actual bounding box (computed by the caller via
/// `crate::render::load_mesh`) and rendered with the loaded mesh,
/// ignoring per-entity `shape` entirely. `None`: each entity uses its own
/// `resolved_shape()` for both collider and render geometry.
pub fn build_world(scene: &SceneFile, mesh_half_extents: Option<[f32; 3]>) -> World {
    let mut world = World::new_empty();
    let mut entities = Vec::with_capacity(scene.entities.len());

    for def in &scene.entities {
        let (shape, render_override) = match mesh_half_extents {
            Some(half_extents) => (Shape::Cuboid { half_extents: Vec3::from(half_extents) }, Some(MeshKind::Loaded)),
            None => (def.resolved_shape(), None),
        };
        let spec = EntitySpec {
            position: Vec3::from(def.position),
            rotation: Vec3::from(def.rotation),
            restitution: def.restitution,
            color: Vec3::from(def.color),
            body_type: def.resolved_body_type(),
            shape,
            render_override,
        };
        let entity = world.spawn(spec);
        if let Some(motion) = def.motion {
            world.add_motion(entity, Vec3::from(def.position), Vec3::from(motion.axis), motion.amplitude, motion.speed);
        }
        entities.push(entity);
    }

    for joint in &scene.joints {
        let (body1_idx, body2_idx, kind) = match joint {
            JointDef::Revolute { body1, body2, axis, anchor1, anchor2 } => {
                (*body1, *body2, JointKind::Revolute { axis: Vec3::from(*axis), anchor1: Vec3::from(*anchor1), anchor2: Vec3::from(*anchor2) })
            }
            JointDef::Fixed { body1, body2, anchor1, anchor2 } => {
                (*body1, *body2, JointKind::Fixed { anchor1: Vec3::from(*anchor1), anchor2: Vec3::from(*anchor2) })
            }
        };
        match (entities.get(body1_idx), entities.get(body2_idx)) {
            (Some(&e1), Some(&e2)) => world.add_joint(e1, e2, kind),
            _ => eprintln!("joint references out-of-range entity index ({body1_idx}, {body2_idx}) for {} entities — skipped.", entities.len()),
        }
    }

    world
}
