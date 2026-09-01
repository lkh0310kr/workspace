//! Scene camera — orbit, follow, fixed (Unity Cinemachine lite / Godot Camera3D).

use glam::Vec3;
use serde::Deserialize;

use crate::world::World;

/// Orbit camera state (shell-driven when mode is `Orbit`).
#[derive(Clone, Debug)]
pub struct OrbitState {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
}

impl Default for OrbitState {
    fn default() -> Self {
        Self {
            yaw: 0.6,
            pitch: 0.35,
            distance: 12.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum CameraDef {
    Orbit {
        #[serde(default = "default_distance")]
        distance: f32,
        #[serde(default = "default_yaw")]
        yaw: f32,
        #[serde(default = "default_pitch")]
        pitch: f32,
    },
    Follow {
        target: String,
        #[serde(default = "default_follow_offset")]
        offset: [f32; 3],
    },
    Fixed {
        position: [f32; 3],
        #[serde(default)]
        look_at: [f32; 3],
    },
}

fn default_distance() -> f32 {
    12.0
}
fn default_yaw() -> f32 {
    0.6
}
fn default_pitch() -> f32 {
    0.35
}
fn default_follow_offset() -> [f32; 3] {
    [0.0, 5.0, 8.0]
}

/// Runtime camera resolved each frame from scene config + optional script overrides.
#[derive(Clone, Debug)]
pub enum CameraMode {
    Orbit(OrbitState),
    Follow { target_name: String, offset: Vec3 },
    Fixed { position: Vec3, look_at: Vec3 },
}

impl Default for CameraMode {
    fn default() -> Self {
        Self::Orbit(OrbitState::default())
    }
}

#[derive(Clone, Debug)]
pub struct RuntimeCamera {
    pub mode: CameraMode,
    pub fov_deg: f32,
}

impl Default for RuntimeCamera {
    fn default() -> Self {
        Self {
            mode: CameraMode::default(),
            fov_deg: 45.0,
        }
    }
}

impl RuntimeCamera {
    pub fn from_def(def: &CameraDef) -> Self {
        let mode = match def {
            CameraDef::Orbit { distance, yaw, pitch } => {
                CameraMode::Orbit(OrbitState {
                    yaw: *yaw,
                    pitch: *pitch,
                    distance: *distance,
                })
            }
            CameraDef::Follow { target, offset } => CameraMode::Follow {
                target_name: target.clone(),
                offset: Vec3::from(*offset),
            },
            CameraDef::Fixed { position, look_at } => CameraMode::Fixed {
                position: Vec3::from(*position),
                look_at: Vec3::from(*look_at),
            },
        };
        Self { mode, fov_deg: 45.0 }
    }

    pub fn orbit_mut(&mut self) -> Option<&mut OrbitState> {
        match &mut self.mode {
            CameraMode::Orbit(state) => Some(state),
            _ => None,
        }
    }

    pub fn set_follow_target(&mut self, name: impl Into<String>) {
        if let CameraMode::Follow { target_name, .. } = &mut self.mode {
            *target_name = name.into();
        } else {
            self.mode = CameraMode::Follow {
                target_name: name.into(),
                offset: Vec3::new(0.0, 5.0, 8.0),
            };
        }
    }

    /// Eye position and look-at target for the view matrix.
    pub fn eye_and_target(&self, world: &World) -> (Vec3, Vec3) {
        match &self.mode {
            CameraMode::Orbit(state) => {
                let (sy, cy) = state.yaw.sin_cos();
                let (sp, cp) = state.pitch.sin_cos();
                let eye = Vec3::new(state.distance * cp * cy, state.distance * sp, state.distance * cp * sy);
                (eye, Vec3::ZERO)
            }
            CameraMode::Follow { target_name, offset } => {
                let target = world
                    .entity_by_name(target_name)
                    .map(|e| world.position(e))
                    .unwrap_or(Vec3::ZERO);
                let eye = target + *offset;
                (eye, target)
            }
            CameraMode::Fixed { position, look_at } => (*position, *look_at),
        }
    }
}
