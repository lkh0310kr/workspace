//! JSON scene format (`world-engine.json`) — one convenience way to build
//! a `World` from data, layered entirely on top of `crate::world`'s real
//! spawn API (`build_world` below just parses JSON then calls
//! `World::spawn`/`add_motion`/`add_joint` in a loop). Not a parallel
//! hardcoded implementation — hand-written game code and JSON-declared
//! scenes go through the exact same `World` methods.

use glam::Vec3;
use serde::Deserialize;
use serde_json::Value;

use crate::camera::{CameraDef, RuntimeCamera};
use crate::script::{load_entity_script, load_world_script, ScriptMode};
use crate::world::{BodyType, EntitySpec, JointKind, MeshKind, Shape, World};

#[derive(Deserialize, Clone)]
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
    /// World gravity in m/s². Defaults to Earth-like −Y.
    #[serde(default = "default_gravity")]
    pub gravity: [f32; 3],
    /// Unity `Time.timeScale` — scales simulation dt (default `1.0`).
    #[serde(default = "default_time_scale")]
    pub time_scale: f32,
    /// Godot-autoload-style world Rhai script (`on_world_update`).
    #[serde(default)]
    pub entry_script: Option<String>,
    /// Unity-style action → key bindings for `input_axis` / `input_pressed`.
    #[serde(default)]
    pub input_map: Option<std::collections::HashMap<String, Value>>,
    /// Scene camera (orbit / follow / fixed).
    #[serde(default)]
    pub camera: Option<CameraDef>,
    /// Optional sub-scene loaded from `scenes/{name}.json` (entities merged).
    #[serde(default)]
    pub active_scene: Option<String>,
    /// Dev ground grid overlay.
    #[serde(default)]
    pub show_grid: bool,
    /// Dev axis gizmo at origin.
    #[serde(default)]
    pub show_axes: bool,
}

impl SceneFile {
    pub fn clone_for_build(&self) -> Self {
        self.clone()
    }
}

#[derive(Deserialize)]
pub struct SubSceneFile {
    #[serde(default)]
    pub entities: Vec<SceneEntityDef>,
}

#[derive(Deserialize, Clone, Debug)]
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

#[derive(Deserialize, Clone, Debug)]
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
    /// Stable name for debugging and future cross-entity script APIs.
    #[serde(default)]
    pub name: Option<String>,
    /// Path to a `.rhai` script relative to the project directory.
    /// Must define `on_update(dt, time, x, y, z) -> [x, y, z]` for kinematic bodies.
    #[serde(default)]
    pub script: Option<String>,
    /// Constants injected into the script scope (numbers and numeric arrays).
    #[serde(default)]
    pub script_args: Option<Value>,
    /// `"kinematic"` (default) — `on_update` returns position; `"force"` — returns force.
    #[serde(default)]
    pub script_mode: Option<String>,
    /// Initial linear velocity in m/s (`[vx, vy, vz]`).
    #[serde(default)]
    pub velocity: Option<[f32; 3]>,
    /// Sensor/trigger collider — overlap events without blocking physics.
    #[serde(default)]
    pub trigger: bool,
    /// Gameplay tags — `entity_with_tag("player")` returns first match.
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    /// Per-entity render mesh override (`cube`, `sphere`, or glTF path).
    #[serde(default)]
    pub mesh: Option<String>,
    /// Mass in kg (dynamic bodies).
    #[serde(default)]
    pub mass: Option<f32>,
    /// Friction coefficient.
    #[serde(default)]
    pub friction: Option<f32>,
    /// Collision layer bit (0–15).
    #[serde(default)]
    pub collision_layer: Option<u16>,
    /// Collision mask bitmask.
    #[serde(default)]
    pub collision_mask: Option<u16>,
}

/// Simple sinusoidal oscillation along one axis — see `World::add_motion`.
#[derive(Deserialize, Clone, Copy, Debug)]
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
    pub fn resolved_shape(&self) -> Shape {
        match self.shape.as_deref() {
            Some("sphere") => Shape::Sphere { radius: self.radius.unwrap_or_else(default_radius) },
            _ => Shape::Cuboid { half_extents: Vec3::from(self.half_extents.unwrap_or_else(default_half_extents)) },
        }
    }

    pub fn resolved_body_type(&self) -> BodyType {
        match self.body_type {
            BodyTypeDef::Dynamic => BodyType::Dynamic,
            BodyTypeDef::Fixed => BodyType::Fixed,
            BodyTypeDef::Kinematic => BodyType::Kinematic,
        }
    }

    pub fn resolved_mesh_kind(&self) -> Option<MeshKind> {
        match self.mesh.as_deref() {
            Some("sphere") => Some(MeshKind::Sphere),
            Some("cube") | Some("cuboid") => Some(MeshKind::Cube),
            Some("loaded") | Some("gltf") => Some(MeshKind::Loaded),
            _ => None,
        }
    }
}

fn default_restitution() -> f32 {
    0.6
}

fn default_color() -> [f32; 3] {
    [0.9, 0.2, 0.2]
}

#[derive(Deserialize, Default, Clone, Copy, Debug)]
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

fn default_gravity() -> [f32; 3] {
    [0.0, -9.81, 0.0]
}

fn default_time_scale() -> f32 {
    1.0
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
            name: None,
            script: None,
            script_args: None,
            script_mode: None,
            velocity: None,
            trigger: false,
            tags: None,
            mesh: None,
            mass: None,
            friction: None,
            collision_layer: None,
            collision_mask: None,
        }],
        mesh: None,
        joints: vec![],
        gravity: default_gravity(),
        time_scale: default_time_scale(),
        entry_script: None,
        input_map: None,
        camera: None,
        active_scene: None,
        show_grid: false,
        show_axes: false,
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
/// `project_dir`: when set, per-entity `script` paths are resolved here.
pub fn build_world(
    scene: &SceneFile,
    mesh_half_extents: Option<[f32; 3]>,
    project_dir: Option<&std::path::Path>,
) -> World {
    let mut merged = scene.clone_for_build();
    if let (Some(dir), Some(scene_name)) = (project_dir, scene.active_scene.as_deref()) {
        let sub_path = dir.join("scenes").join(format!("{scene_name}.json"));
        if let Ok(contents) = std::fs::read_to_string(&sub_path) {
            if let Ok(sub) = serde_json::from_str::<SubSceneFile>(&contents) {
                merged.entities.extend(sub.entities);
            } else {
                eprintln!("failed to parse sub-scene {sub_path:?}");
            }
        } else {
            eprintln!("active_scene {scene_name} not found at {sub_path:?}");
        }
    }

    let mut world = World::new_empty();
    if let Some(dir) = project_dir {
        world.set_project_dir(dir.to_path_buf());
    }
    world.set_gravity(Vec3::from(merged.gravity));
    world.set_time_scale(merged.time_scale);
    world.set_show_grid(merged.show_grid);
    if let Some(cam) = &merged.camera {
        world.camera_mut().mode = crate::camera::RuntimeCamera::from_def(cam).mode;
        world.camera_mut().fov_deg = crate::camera::RuntimeCamera::from_def(cam).fov_deg;
    }
    if let (Some(dir), Some(script_rel)) = (project_dir, merged.entry_script.as_deref()) {
        match load_world_script(dir, script_rel) {
            Ok(script) => world.attach_world_script(script),
            Err(err) => eprintln!("entry_script error: {err}"),
        }
    }
    if let Some(map) = &merged.input_map {
        world.set_input_map(crate::input::InputMap::from_json(map));
    }
    let mut entities = Vec::with_capacity(merged.entities.len());

    for def in &merged.entities {
        let (shape, render_override) = match mesh_half_extents {
            Some(half_extents) => (Shape::Cuboid { half_extents: Vec3::from(half_extents) }, Some(MeshKind::Loaded)),
            None => (def.resolved_shape(), def.resolved_mesh_kind()),
        };
        let spec = EntitySpec {
            position: Vec3::from(def.position),
            rotation: Vec3::from(def.rotation),
            restitution: def.restitution,
            color: Vec3::from(def.color),
            body_type: def.resolved_body_type(),
            shape,
            render_override,
            velocity: def.velocity.map(Vec3::from).unwrap_or(Vec3::ZERO),
            sensor: def.trigger,
            mass: def.mass.unwrap_or(1.0),
            friction: def.friction.unwrap_or(0.5),
            collision_layer: def.collision_layer.unwrap_or(1),
            collision_mask: def.collision_mask.unwrap_or(0xFFFF),
        };
        let entity = world.spawn_named(spec, def.name.clone());
        if let Some(tags) = &def.tags {
            world.set_tags(entity, tags.clone());
        }
        if let (Some(dir), Some(script_rel)) = (project_dir, def.script.as_deref()) {
            let mode = ScriptMode::parse(def.script_mode.as_deref().unwrap_or("kinematic"));
            match load_entity_script(dir, script_rel, def.script_args.as_ref(), mode) {
                Ok(script) => world.attach_script(entity, script),
                Err(err) => eprintln!("entity script error: {err}"),
            }
        }
        if let Some(motion) = def.motion {
            world.add_motion(entity, Vec3::from(def.position), Vec3::from(motion.axis), motion.amplitude, motion.speed);
        }
        entities.push(entity);
    }

    for joint in &merged.joints {
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
