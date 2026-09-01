//! World Engine — the real, integrated engine core: rendering (`wgpu`),
//! physics (`rapier3d`), ECS (`hecs`), assembled as a real Rust library a
//! game/simulation's own code links against and drives — not a
//! JSON-only scene player. See `README.md` and
//! `docs/architecture/09-future-native-architecture.md` ("Phase 10") for
//! the reasoning behind this split and the API's shape.
//!
//! `world::{EntitySpec, Behavior, World::spawn*}` is the actual SDK
//! surface. `scene`'s JSON loader (`world-engine.json`) is one
//! convenience way to build a `World` from data, layered on top of that
//! same API — not a parallel hardcoded path.

pub mod camera;
pub mod events;
pub mod input;
pub mod prefab;
pub mod render;
pub mod save;
pub mod scene;
pub mod script;
pub mod world;

pub use render::{Camera, GpuContext, Mesh, RenderOptions, Vertex, HEIGHT, WIDTH, init_gpu, init_gpu_sized, load_mesh, render_frame, render_frame_with_options};
#[cfg(target_os = "windows")]
pub use render::init_gpu_win32;
pub use scene::{SceneFile, build_world, default_scene, load_scene};
pub use input::{InputMap, InputState, key_name_from_qt};
pub use events::{CollisionEvent, CollisionEventBuffer};
pub use camera::{CameraDef, RuntimeCamera};
pub use save::{EntitySave, WorldSave};
pub use prefab::{PrefabFile, load_prefab, spawn_prefab_at};
pub use world::{Behavior, BodyType, EntitySpec, JointKind, MeshKind, Projectile, Shape, UpdateCtx, World};
