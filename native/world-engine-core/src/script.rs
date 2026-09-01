//! Project-local Rhai scripts attached to entities via `world-engine.json`.
//! Scripts live in the project directory (Godot-style isolation) and are
//! loaded relative to that folder — not bundled into Workspace Electron.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;

use glam::{EulerRot, Quat, Vec3};
use rapier3d::prelude::RigidBody;
use rhai::{AST, Array, Dynamic, Engine, Scope};
use serde_json::Value;

use crate::world::World;

/// Rhai scripting API version — bump on breaking script surface changes.
pub const RHAI_API_VERSION: &str = "3";

thread_local! {
    static WORLD_SNAPSHOT: RefCell<WorldSnapshot> = RefCell::new(WorldSnapshot::default());
    static PENDING_WORLD_CONTROL: RefCell<WorldControlPatch> = RefCell::new(WorldControlPatch::default());
    static INPUT_SNAPSHOT: RefCell<Option<crate::input::InputSnapshot>> = const { RefCell::new(None) };
    static SIM_VARS: RefCell<HashMap<String, f64>> = RefCell::new(HashMap::new());
    static PENDING_SIM_VARS: RefCell<HashMap<String, f64>> = RefCell::new(HashMap::new());
}

pub fn install_sim_vars(vars: &HashMap<String, f64>) {
    SIM_VARS.with(|cell| *cell.borrow_mut() = vars.clone());
}

pub fn take_sim_var_patch() -> HashMap<String, f64> {
    PENDING_SIM_VARS.with(|cell| std::mem::take(&mut *cell.borrow_mut()))
}

pub fn install_input_snapshot(snapshot: &crate::input::InputSnapshot) {
    INPUT_SNAPSHOT.with(|cell| *cell.borrow_mut() = Some(snapshot.clone()));
}

/// Side effects requested by world/entity scripts during a step.
#[derive(Clone, Default)]
pub struct WorldControlPatch {
    pub time_scale: Option<f32>,
    pub camera_target: Option<String>,
    pub spawn_prefab: Option<(String, f64, f64, f64)>,
    pub spawn_projectile: Option<(f64, f64, f64, f64, f64, f64, f64)>,
}

pub fn take_world_control_patch() -> WorldControlPatch {
    PENDING_WORLD_CONTROL.with(|cell| std::mem::take(&mut *cell.borrow_mut()))
}

/// Named-entity positions for one simulation step (Godot `get_node` / Unity
/// `GameObject.Find` snapshot — read-only during script evaluation).
#[derive(Clone, Default)]
pub struct WorldSnapshot {
    positions: HashMap<String, [f32; 3]>,
    rotations: HashMap<String, [f32; 3]>,
    tag_to_entity: HashMap<String, String>,
}

impl WorldSnapshot {
    pub fn from_world(world: &World) -> Self {
        Self {
            positions: world
                .named_positions()
                .into_iter()
                .map(|(name, pos)| (name, [pos.x, pos.y, pos.z]))
                .collect(),
            rotations: world
                .named_rotations()
                .into_iter()
                .map(|(name, rot)| (name, [rot.x, rot.y, rot.z]))
                .collect(),
            tag_to_entity: world.tag_index(),
        }
    }

    pub fn install(&self) {
        WORLD_SNAPSHOT.with(|cell| *cell.borrow_mut() = self.clone());
    }
}

/// How an entity script drives its rigid body (Unity-style script modes).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ScriptMode {
    /// `on_update` returns `[x, y, z]` — kinematic target (default).
    #[default]
    Kinematic,
    /// `on_update` returns `[fx, fy, fz]` — force applied to dynamic body.
    Force,
    /// `on_update` returns `[ix, iy, iz]` — impulse applied once per step.
    Impulse,
}

impl ScriptMode {
    pub fn parse(raw: &str) -> Self {
        match raw.to_ascii_lowercase().as_str() {
            "force" | "dynamic" => Self::Force,
            "impulse" => Self::Impulse,
            _ => Self::Kinematic,
        }
    }
}

fn new_engine() -> Engine {
    let mut engine = Engine::new();
    engine.set_max_expr_depths(64, 64);

    engine.register_fn("entity_pos", |name: &str| -> Array {
        WORLD_SNAPSHOT.with(|cell| {
            cell.borrow()
                .positions
                .get(name)
                .map(|p| vec![Dynamic::from(p[0] as f64), Dynamic::from(p[1] as f64), Dynamic::from(p[2] as f64)])
                .unwrap_or_default()
        })
    });

    engine.register_fn("entity_x", |name: &str| -> f64 {
        WORLD_SNAPSHOT.with(|cell| cell.borrow().positions.get(name).map(|p| p[0] as f64).unwrap_or(0.0))
    });
    engine.register_fn("entity_y", |name: &str| -> f64 {
        WORLD_SNAPSHOT.with(|cell| cell.borrow().positions.get(name).map(|p| p[1] as f64).unwrap_or(0.0))
    });
    engine.register_fn("entity_z", |name: &str| -> f64 {
        WORLD_SNAPSHOT.with(|cell| cell.borrow().positions.get(name).map(|p| p[2] as f64).unwrap_or(0.0))
    });

    engine.register_fn("entity_rot", |name: &str| -> Array {
        WORLD_SNAPSHOT.with(|cell| {
            cell.borrow()
                .rotations
                .get(name)
                .map(|r| vec![Dynamic::from(r[0] as f64), Dynamic::from(r[1] as f64), Dynamic::from(r[2] as f64)])
                .unwrap_or_default()
        })
    });

    engine.register_fn("entity_with_tag", |tag: &str| -> String {
        WORLD_SNAPSHOT.with(|cell| cell.borrow().tag_to_entity.get(tag).cloned().unwrap_or_default())
    });

    engine.register_fn("dist3", |x1: f64, y1: f64, z1: f64, x2: f64, y2: f64, z2: f64| -> f64 {
        let dx = x2 - x1;
        let dy = y2 - y1;
        let dz = z2 - z1;
        (dx * dx + dy * dy + dz * dz).sqrt()
    });

    engine.register_fn("lerp3", |x1: f64, y1: f64, z1: f64, x2: f64, y2: f64, z2: f64, t: f64| -> Array {
        vec![
            Dynamic::from(x1 + (x2 - x1) * t),
            Dynamic::from(y1 + (y2 - y1) * t),
            Dynamic::from(z1 + (z2 - z1) * t),
        ]
    });

    engine.register_fn("yaw_from_delta", |dx: f64, dz: f64| -> f64 { dx.atan2(dz) });

    engine.register_fn("input_axis", |name: &str| -> f64 {
        INPUT_SNAPSHOT.with(|cell| cell.borrow().as_ref().map(|s| s.axis(name) as f64).unwrap_or(0.0))
    });
    engine.register_fn("input_pressed", |name: &str| -> bool {
        INPUT_SNAPSHOT.with(|cell| cell.borrow().as_ref().is_some_and(|s| s.pressed(name)))
    });
    engine.register_fn("input_down", |name: &str| -> bool {
        INPUT_SNAPSHOT.with(|cell| cell.borrow().as_ref().is_some_and(|s| s.down(name)))
    });

    engine.register_fn("sim_var", |name: &str| -> f64 {
        SIM_VARS.with(|cell| cell.borrow().get(name).copied().unwrap_or(0.0))
    });
    engine.register_fn("set_sim_var", |name: &str, value: f64| {
        PENDING_SIM_VARS.with(|cell| {
            cell.borrow_mut().insert(name.to_string(), value);
        });
    });

    engine.register_fn("spawn_projectile", |x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, lifetime: f64| {
        PENDING_WORLD_CONTROL.with(|cell| {
            cell.borrow_mut().spawn_projectile = Some((x, y, z, vx, vy, vz, lifetime));
        });
    });

    engine
}

fn new_world_engine() -> Engine {
    let mut engine = new_engine();
    engine.register_fn("set_time_scale", |scale: f64| {
        PENDING_WORLD_CONTROL.with(|cell| cell.borrow_mut().time_scale = Some(scale as f32));
    });
    engine.register_fn("set_camera_target", |name: &str| {
        PENDING_WORLD_CONTROL.with(|cell| cell.borrow_mut().camera_target = Some(name.to_string()));
    });
    engine.register_fn("spawn_prefab", |name: &str, x: f64, y: f64, z: f64| {
        PENDING_WORLD_CONTROL.with(|cell| cell.borrow_mut().spawn_prefab = Some((name.to_string(), x, y, z)));
    });
    engine
}

/// Loaded Rhai script for one entity. Stored on `World` (not in ECS) because
/// Rhai's `Engine`/`AST` are not `Send`.
pub struct EntityScript {
    engine: Engine,
    ast: AST,
    mode: ScriptMode,
    /// Reused every frame so script locals / module-level `let` state persist (Godot-style).
    scope: Scope<'static>,
    has_on_collision: bool,
    path_label: String,
}

impl EntityScript {
    pub fn mode(&self) -> ScriptMode {
        self.mode
    }

    pub fn apply(
        &mut self,
        dt: f32,
        time: f32,
        rigid_body: &mut RigidBody,
        snapshot: &WorldSnapshot,
    ) -> Option<String> {
        snapshot.install();
        let pos = rigid_body.translation();
        let result = self.engine.call_fn::<Array>(
            &mut self.scope,
            &self.ast,
            "on_update",
            (
                dt as f64,
                time as f64,
                pos.x as f64,
                pos.y as f64,
                pos.z as f64,
            ),
        );

        let arr = match result {
            Ok(arr) => arr,
            Err(err) => {
                return Some(format!("{} on_update error: {err}", self.path_label));
            }
        };

        if arr.len() != 3 && arr.len() != 6 {
            return Some(format!(
                "{} on_update must return [x,y,z] or [x,y,z,rx,ry,rz], got {} elements",
                self.path_label,
                arr.len()
            ));
        }

        let x = arr[0].as_float().unwrap_or(0.0) as f32;
        let y = arr[1].as_float().unwrap_or(0.0) as f32;
        let z = arr[2].as_float().unwrap_or(0.0) as f32;

        match self.mode {
            ScriptMode::Kinematic => {
                rigid_body.set_next_kinematic_translation(Vec3::new(x, y, z));
                if arr.len() == 6 {
                    let rx = arr[3].as_float().unwrap_or(0.0) as f32;
                    let ry = arr[4].as_float().unwrap_or(0.0) as f32;
                    let rz = arr[5].as_float().unwrap_or(0.0) as f32;
                    let rot = Quat::from_euler(EulerRot::YXZ, ry, rx, rz);
                    rigid_body.set_next_kinematic_rotation(rot);
                }
            }
            ScriptMode::Force => rigid_body.add_force(Vec3::new(x, y, z), true),
            ScriptMode::Impulse => rigid_body.apply_impulse(Vec3::new(x, y, z), true),
        }
        None
    }

    pub fn apply_collision(
        &mut self,
        other_name: &str,
        started: bool,
        rigid_body: &mut RigidBody,
        snapshot: &WorldSnapshot,
    ) -> Option<String> {
        if !self.has_on_collision {
            return None;
        }
        snapshot.install();
        let pos = rigid_body.translation();
        let result = self.engine.call_fn::<()>(
            &mut self.scope,
            &self.ast,
            "on_collision",
            (
                other_name.to_string(),
                started,
                pos.x as f64,
                pos.y as f64,
                pos.z as f64,
            ),
        );
        if let Err(err) = result {
            return Some(format!("{} on_collision error: {err}", self.path_label));
        }
        None
    }
}

/// Godot autoload / Unity scene-manager style world script.
pub struct WorldScript {
    engine: Engine,
    ast: AST,
    /// Persists module-level `let` state across frames (autoload pattern).
    scope: Scope<'static>,
}

impl WorldScript {
    pub fn apply(&mut self, dt: f32, time: f32, snapshot: &WorldSnapshot) -> Option<String> {
        snapshot.install();
        if let Err(err) = self.engine.call_fn::<()>(&mut self.scope, &self.ast, "on_world_update", (dt as f64, time as f64)) {
            return Some(format!("entry_script on_world_update error: {err}"));
        }
        None
    }
}

/// Loads `on_update(dt, time, x, y, z) -> [x, y, z]` from a `.rhai` file.
pub fn load_entity_script(
    project_dir: &Path,
    script_rel: &str,
    args: Option<&Value>,
    mode: ScriptMode,
) -> Result<EntityScript, String> {
    let path = project_dir.join(script_rel);
    let source = std::fs::read_to_string(&path).map_err(|err| format!("failed to read script {path:?}: {err}"))?;

    let path_label = format!("{path:?}");
    let has_on_collision = source.contains("fn on_collision");

    let engine = new_engine();
    let ast = engine
        .compile(&source)
        .map_err(|err| format!("failed to compile script {path:?}: {err}"))?;

    let mut scope = build_args_scope(args);
    engine
        .run_ast_with_scope(&mut scope, &ast)
        .map_err(|err| format!("failed to init script scope {path:?}: {err}"))?;
    engine
        .call_fn::<Array>(&mut scope, &ast, "on_update", (0.0_f64, 0.0_f64, 0.0_f64, 0.0_f64, 0.0_f64))
        .map_err(|err| format!("script {path:?} must define on_update(dt, time, x, y, z) -> [x,y,z]: {err}"))?;

    Ok(EntityScript {
        engine,
        ast,
        mode,
        scope,
        has_on_collision,
        path_label,
    })
}

/// Loads `on_world_update(dt, time)` from a `.rhai` file.
pub fn load_world_script(project_dir: &Path, script_rel: &str) -> Result<WorldScript, String> {
    let path = project_dir.join(script_rel);
    let source = std::fs::read_to_string(&path).map_err(|err| format!("failed to read script {path:?}: {err}"))?;

    let engine = new_world_engine();
    let ast = engine
        .compile(&source)
        .map_err(|err| format!("failed to compile script {path:?}: {err}"))?;

    let mut scope = Scope::new();
    engine
        .run_ast_with_scope(&mut scope, &ast)
        .map_err(|err| format!("failed to init world script scope {path:?}: {err}"))?;
    engine
        .call_fn::<()>(&mut scope, &ast, "on_world_update", (0.0_f64, 0.0_f64))
        .map_err(|err| format!("world script {path:?} must define on_world_update(dt, time): {err}"))?;

    Ok(WorldScript { engine, ast, scope })
}

fn build_args_scope(args: Option<&Value>) -> Scope<'static> {
    let mut scope = Scope::new();
    if let Some(Value::Object(map)) = args {
        for (key, value) in map {
            push_json_value(&mut scope, key, value);
        }
    }
    scope
}

fn push_json_value(scope: &mut Scope<'static>, key: &str, value: &Value) {
    match value {
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                scope.push(key.to_string(), f);
            }
        }
        Value::String(s) => {
            scope.push(key.to_string(), s.clone());
        }
        Value::Array(items) => {
            let arr: Array = items.iter().filter_map(json_to_dynamic).collect();
            scope.push(key.to_string(), arr);
        }
        Value::Object(map) => {
            for (k, v) in map {
                push_json_value(scope, k, v);
            }
        }
        _ => {}
    }
}

fn json_to_dynamic(value: &Value) -> Option<Dynamic> {
    match value {
        Value::Number(n) => n.as_f64().map(Dynamic::from),
        Value::Array(items) => {
            let arr: Array = items.iter().filter_map(json_to_dynamic).collect();
            Some(Dynamic::from(arr))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::world::{BodyType, EntitySpec, Shape, World};

    fn fixture_dir(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../../electron/test-fixtures/{name}"))
    }

    fn chase_script_args() -> Value {
        serde_json::json!({ "speed": 3.0 })
    }

    #[test]
    fn entity_script_moves_kinematic_body() {
        let dir = fixture_dir("world-engine-chase-demo");
        if !dir.join("scripts/chase.rhai").exists() {
            return;
        }

        let args = chase_script_args();
        let script = load_entity_script(&dir, "scripts/chase.rhai", Some(&args), ScriptMode::Kinematic)
            .expect("load chase script");
        let mut world = World::new_empty();
        let target = Vec3::new(5.0, 1.0, 0.0);
        world.spawn_named(
            EntitySpec {
                position: target,
                body_type: BodyType::Fixed,
                shape: Shape::Sphere { radius: 0.3 },
                ..Default::default()
            },
            Some("target".to_string()),
        );
        let chaser = world.spawn_named(
            EntitySpec {
                position: Vec3::new(-5.0, 1.0, 0.0),
                body_type: BodyType::Kinematic,
                shape: Shape::Sphere { radius: 0.3 },
                ..Default::default()
            },
            Some("chaser".to_string()),
        );
        world.attach_script(chaser, script);

        for _ in 0..300 {
            world.step();
        }

        let final_pos = world.position(chaser);
        assert!((target - final_pos).length() < 0.2, "script should chase target");
    }

    #[test]
    fn orbit_script_circles_planet() {
        let dir = fixture_dir("world-engine-orbit-demo");
        if !dir.join("scripts/orbit.rhai").exists() {
            return;
        }

        let script = load_entity_script(
            &dir,
            "scripts/orbit.rhai",
            Some(&serde_json::json!({ "radius": 4.0, "speed": 1.5, "center_y": 2.0, "center_name": "planet" })),
            ScriptMode::Kinematic,
        )
        .expect("load orbit script");

        let mut world = World::new_empty();
        world.set_gravity(Vec3::ZERO);
        world.spawn_named(
            EntitySpec {
                position: Vec3::new(0.0, 2.0, 0.0),
                body_type: BodyType::Fixed,
                shape: Shape::Sphere { radius: 0.8 },
                color: Vec3::new(1.0, 0.8, 0.2),
                ..Default::default()
            },
            Some("planet".to_string()),
        );
        let moon = world.spawn_named(
            EntitySpec {
                position: Vec3::new(4.0, 2.0, 0.0),
                body_type: BodyType::Kinematic,
                shape: Shape::Sphere { radius: 0.25 },
                ..Default::default()
            },
            Some("moon".to_string()),
        );
        world.attach_script(moon, script);

        for _ in 0..400 {
            world.step();
        }

        let pos = world.position(moon);
        let dist = (Vec3::new(pos.x, 0.0, pos.z) - Vec3::ZERO).length();
        assert!((dist - 4.0).abs() < 0.3, "moon should stay near orbital radius");
    }
}
