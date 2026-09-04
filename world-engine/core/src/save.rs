//! World snapshot save/load (Unity PlayerPrefs + scene serialize lite).

use std::collections::HashMap;

use glam::Vec3;
use serde::{Deserialize, Serialize};

use crate::world::{BodyType, World};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EntitySave {
    pub name: Option<String>,
    pub position: [f32; 3],
    pub rotation_euler: [f32; 3],
    pub velocity: [f32; 3],
    pub body_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct WorldSave {
    pub sim_time: f32,
    pub time_scale: f32,
    pub entities: Vec<EntitySave>,
    /// Shared simulation scalars (Phase 38).
    #[serde(default)]
    pub sim_vars: HashMap<String, f64>,
    /// Rhai RNG stream position for deterministic continuation.
    #[serde(default)]
    pub rng_state: u64,
    /// Scene seed at snapshot time (informational).
    #[serde(default = "default_sim_seed")]
    pub sim_seed: u64,
}

fn default_sim_seed() -> u64 {
    1
}

impl World {
    /// Serializable snapshot of named entities and runtime simulation state.
    pub fn snapshot(&self) -> WorldSave {
        let mut entities = Vec::new();
        for name in self.entity_names() {
            let Some(entity) = self.entity_by_name(&name) else { continue };
            let pos = self.position(entity);
            let rot = self.rotation_euler(entity);
            let vel = self.linear_velocity(entity);
            let body_type = match self.body_type_of(entity) {
                BodyType::Dynamic => "dynamic",
                BodyType::Fixed => "fixed",
                BodyType::Kinematic => "kinematic",
                BodyType::None => "none",
            };
            entities.push(EntitySave {
                name: Some(name.clone()),
                position: [pos.x, pos.y, pos.z],
                rotation_euler: [rot.x, rot.y, rot.z],
                velocity: [vel.x, vel.y, vel.z],
                body_type: body_type.to_string(),
            });
        }
        entities.sort_by(|a, b| a.name.cmp(&b.name));
        WorldSave {
            sim_time: self.sim_time(),
            time_scale: self.time_scale(),
            entities,
            sim_vars: self.sim_vars().clone(),
            rng_state: self.rng_state(),
            sim_seed: self.sim_seed(),
        }
    }

    /// Restores transforms and runtime simulation state for an existing scene.
    pub fn restore(&mut self, save: &WorldSave) {
        self.set_time_scale(save.time_scale);
        self.set_sim_time(save.sim_time);
        self.replace_sim_vars(save.sim_vars.clone());
        self.set_rng_state(save.rng_state);
        for entry in &save.entities {
            let Some(name) = &entry.name else { continue };
            let Some(entity) = self.entity_by_name(name) else { continue };
            self.set_entity_transform(
                entity,
                Vec3::from(entry.position),
                Vec3::from(entry.rotation_euler),
                Vec3::from(entry.velocity),
            );
        }
    }

    pub fn save_to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&self.snapshot())
    }

    pub fn restore_from_json(&mut self, json: &str) -> Result<(), String> {
        let save: WorldSave = serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.restore(&save);
        Ok(())
    }
}
