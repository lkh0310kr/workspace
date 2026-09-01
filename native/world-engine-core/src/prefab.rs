//! Prefab spawning (Unity Prefab / Godot PackedScene lite).

use std::path::Path;

use glam::Vec3;
use serde::Deserialize;

use crate::scene::SceneEntityDef;
use crate::script::{load_entity_script, ScriptMode};
use crate::world::{EntitySpec, MeshKind, Shape, World};

#[derive(Debug, Deserialize)]
pub struct PrefabFile {
    #[serde(default)]
    pub entities: Vec<SceneEntityDef>,
}

pub fn load_prefab(path: &Path) -> Result<PrefabFile, String> {
    let contents =
        std::fs::read_to_string(path).map_err(|err| format!("failed to read prefab {path:?}: {err}"))?;
    serde_json::from_str(&contents).map_err(|err| format!("failed to parse prefab {path:?}: {err}"))
}

/// Spawns all entities from a prefab at `origin`, returning spawned entity handles.
pub fn spawn_prefab_at(
    world: &mut World,
    prefab: &PrefabFile,
    origin: Vec3,
    project_dir: &Path,
) -> Vec<hecs::Entity> {
    let mut spawned = Vec::with_capacity(prefab.entities.len());
    for def in &prefab.entities {
        let spec = entity_spec_from_def(def, origin);
        let entity = world.spawn_named(spec, def.name.clone());
        attach_entity_script(world, entity, def, project_dir);
        if let Some(motion) = def.motion {
            world.add_motion(entity, origin + Vec3::from(def.position), Vec3::from(motion.axis), motion.amplitude, motion.speed);
        }
        if let Some(tags) = &def.tags {
            world.set_tags(entity, tags.clone());
        }
        spawned.push(entity);
    }
    spawned
}

fn entity_spec_from_def(def: &SceneEntityDef, origin: Vec3) -> EntitySpec {
    EntitySpec {
        position: origin + Vec3::from(def.position),
        rotation: Vec3::from(def.rotation),
        restitution: def.restitution,
        color: Vec3::from(def.color),
        body_type: def.resolved_body_type(),
        shape: def.resolved_shape(),
        render_override: def.resolved_mesh_kind(),
        velocity: def.velocity.map(Vec3::from).unwrap_or(Vec3::ZERO),
        sensor: def.trigger,
        mass: def.mass.unwrap_or(1.0),
        friction: def.friction.unwrap_or(0.5),
        collision_layer: def.collision_layer.unwrap_or(1),
        collision_mask: def.collision_mask.unwrap_or(0xFFFF),
    }
}

fn attach_entity_script(world: &mut World, entity: hecs::Entity, def: &SceneEntityDef, project_dir: &Path) {
    if let Some(script_rel) = def.script.as_deref() {
        let mode = ScriptMode::parse(def.script_mode.as_deref().unwrap_or("kinematic"));
        match load_entity_script(project_dir, script_rel, def.script_args.as_ref(), mode) {
            Ok(script) => world.attach_script(entity, script),
            Err(err) => eprintln!("prefab script error: {err}"),
        }
    }
}
