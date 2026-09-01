//! Prefab spawning (Unity Prefab / Godot PackedScene lite).

use std::path::Path;

use glam::Vec3;
use serde::Deserialize;

use crate::scene::{lower_entity_def, spawn_from_blueprint, SceneEntityDef};

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
    world: &mut crate::world::World,
    prefab: &PrefabFile,
    origin: Vec3,
    project_dir: &Path,
) -> Vec<hecs::Entity> {
    let mut spawned = Vec::with_capacity(prefab.entities.len());
    for def in &prefab.entities {
        let blueprint = lower_entity_def(def, None);
        let entity = spawn_from_blueprint(world, &blueprint, origin, Some(project_dir));
        spawned.push(entity);
    }
    spawned
}
