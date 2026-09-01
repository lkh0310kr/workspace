//! The engine's ECS/physics `World` and the actual SDK surface: real code
//! hooks into a running world here (`spawn`/`spawn_with_behavior`, the
//! `Behavior` trait) — `crate::scene`'s JSON loader is a convenience layer
//! built on top of this, not a separate implementation.

use std::collections::HashMap;

use glam::{EulerRot, Mat4, Quat, Vec3};
use hecs::Entity;
use rapier3d::prelude::*;
use serde_json::Value;

use crate::camera::RuntimeCamera;
use crate::events::CollisionEventBuffer;
use crate::input::{InputMap, InputState};
use crate::script::{EntityScript, WorldScript, WorldSnapshot, take_world_control_patch};

struct EntityTags(Vec<String>);

pub struct Transform {
    pub translation: Vec3,
    pub rotation: Quat,
}
struct PhysicsBody(RigidBodyHandle);
struct PhysicsCollider(ColliderHandle);
struct Tint(Vec3);

/// Present only on entities with scripted motion (`World::add_motion`) —
/// drives a kinematic body via `set_next_kinematic_translation` each step
/// instead of leaving it sitting there like a fixed body.
struct Motion {
    origin: Vec3,
    axis: Vec3,
    amplitude: f32,
    speed: f32,
}

/// Which uploaded `Mesh` in `crate::render::GpuContext` this entity draws
/// with — decided once at spawn time (from `EntitySpec::shape` or an
/// explicit `render_override`), not re-decided per frame.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum MeshKind {
    Cube,
    Sphere,
    Loaded,
}
struct RenderMesh(MeshKind);
/// Visual scale applied to the unit cube/sphere mesh at draw time.
struct RenderScale(Vec3);

struct EntityName(String);

/// Design metadata — engine-agnostic key/value (Phase 34).
struct Properties(HashMap<String, Value>);

/// Axis-aligned half extents for picking when no `RenderScale` is present (Phase 41).
struct PickBounds(Vec3);

struct BehaviorSlot(Box<dyn Behavior>);

/// Real per-frame user logic hooked into the engine loop — the actual
/// point of splitting the engine into a library. Attach via
/// `World::spawn_with_behavior`. Runs once per `step()`, before the
/// physics step (so anything it sets — a force, an impulse, a kinematic
/// target via `UpdateCtx::rigid_body` — is consumed by that same step,
/// matching the ordering scripted `Motion` already uses).
///
/// Deliberately minimal for this phase: one trait, one way to attach, and
/// only direct rigid-body access — no event bus, no query DSL beyond what
/// `hecs` itself gives you if you need more (real future scope).
pub trait Behavior: Send + Sync + 'static {
    fn update(&mut self, ctx: &mut UpdateCtx);
}

pub struct UpdateCtx<'a> {
    pub entity: Entity,
    pub dt: f32,
    pub time: f32,
    pub rigid_body: &'a mut RigidBody,
}

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub enum BodyType {
    #[default]
    Dynamic,
    Fixed,
    Kinematic,
    /// No Rapier body — transform-only scene object (Phase 41).
    None,
}

#[derive(Clone, Copy, Debug)]
pub enum Shape {
    Cuboid { half_extents: Vec3 },
    Sphere { radius: f32 },
}

/// Describes transform placement for composition spawn APIs.
#[derive(Clone, Copy, Debug)]
pub struct TransformSpec {
    pub position: Vec3,
    pub rotation: Vec3,
}

/// Rapier collider + rigid body bundle.
#[derive(Clone, Copy, Debug)]
pub struct PhysicsSpec {
    pub body_type: BodyType,
    pub shape: Shape,
    pub restitution: f32,
    pub velocity: Vec3,
    pub sensor: bool,
    pub mass: f32,
    pub friction: f32,
    pub collision_layer: u16,
    pub collision_mask: u16,
}

/// Draw mesh + tint for an entity.
#[derive(Clone, Copy, Debug)]
pub struct RenderSpec {
    pub color: Vec3,
    pub mesh_kind: MeshKind,
    pub scale: Vec3,
}

/// Hand-written spawn bundle — still supported; internally uses `spawn_empty` +
/// `attach_*` (Phase 41). Prefer `lower_entity_def` + `spawn_from_blueprint`
/// for JSON-aligned scenes.
pub struct EntitySpec {
    pub position: Vec3,
    pub rotation: Vec3,
    pub restitution: f32,
    pub color: Vec3,
    pub body_type: BodyType,
    pub shape: Shape,
    /// Overrides the render mesh normally derived from `shape` (Cuboid →
    /// cube, Sphere → sphere). Only meaningful when the collider is a
    /// shape standing in for something else that actually gets rendered
    /// (e.g. a loaded glTF mesh's AABB, used as a cuboid collider but
    /// drawn with the real loaded geometry) — an escape hatch the JSON
    /// scene loader uses, not something typical hand-written game code
    /// needs to touch.
    pub render_override: Option<MeshKind>,
    /// Initial linear velocity in m/s (dynamic bodies; ignored for fixed).
    pub velocity: Vec3,
    /// Sensor collider — generates collision events without physical response.
    pub sensor: bool,
    /// Rapier mass in kg (dynamic bodies).
    pub mass: f32,
    /// Coulomb friction coefficient.
    pub friction: f32,
    /// Collision membership layer (bit index 0–15).
    pub collision_layer: u16,
    /// Collision filter mask — which layers this collider interacts with.
    pub collision_mask: u16,
}

impl Default for EntitySpec {
    fn default() -> Self {
        Self {
            position: Vec3::ZERO,
            rotation: Vec3::ZERO,
            restitution: 0.6,
            color: Vec3::new(0.9, 0.2, 0.2),
            body_type: BodyType::default(),
            shape: Shape::Cuboid { half_extents: Vec3::splat(0.5) },
            render_override: None,
            velocity: Vec3::ZERO,
            sensor: false,
            mass: 1.0,
            friction: 0.5,
            collision_layer: 1,
            collision_mask: 0xFFFF,
        }
    }
}

pub enum JointKind {
    /// A hinge — locks all relative motion except rotation around `axis`
    /// (local-space, shared by both bodies). `anchor1`/`anchor2` are the
    /// pivot point in each body's own local space — offsetting `anchor2`
    /// from a dynamic body's center gives it a lever arm to swing on (a
    /// pendulum).
    Revolute { axis: Vec3, anchor1: Vec3, anchor2: Vec3 },
    /// Welds two bodies together at their anchors — zero relative motion,
    /// a real rapier3d constraint the solver enforces every step.
    Fixed { anchor1: Vec3, anchor2: Vec3 },
}

pub struct World {
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
    entities: Vec<Entity>,
    /// Running clock, advanced once per `step()` by the fixed physics
    /// timestep — drives `Motion`'s sinusoidal offset and `UpdateCtx::time`.
    time: f32,
    gravity: Vec3,
    names: HashMap<String, Entity>,
    /// Per-entity Rhai scripts — kept outside ECS because Rhai is not `Send`.
    scripts: HashMap<Entity, EntityScript>,
    /// Godot-autoload-style world script (optional).
    world_script: Option<WorldScript>,
    /// Unity `Time.timeScale` — scales dt for scripts and physics.
    time_scale: f32,
    input: InputState,
    input_map: InputMap,
    collider_to_entity: HashMap<ColliderHandle, Entity>,
    collision_events: CollisionEventBuffer,
    last_script_error: Option<String>,
    camera: RuntimeCamera,
    show_grid: bool,
    /// Shared f64 key/value store — readable from any Rhai script (`sim_var` / `set_sim_var`).
    sim_vars: HashMap<String, f64>,
    sim_seed: u64,
    rng_state: u64,
    projectiles: Vec<Projectile>,
    project_dir: Option<std::path::PathBuf>,
}

/// Short-lived kinematic projectile (top-down shooter pattern).
#[derive(Clone, Debug)]
pub struct Projectile {
    pub entity: Entity,
    pub velocity: Vec3,
    pub lifetime: f32,
    pub age: f32,
}

impl World {
    /// A physics/render world with just the ground plane — no entities.
    /// `spawn`/`spawn_with_behavior` are the real entry points;
    /// `crate::scene::build_world` is a convenience layer for
    /// JSON-declared scenes built on top of this same `World`.
    pub fn new_empty() -> Self {
        let rigid_body_set = RigidBodySet::new();
        let mut collider_set = ColliderSet::new();
        collider_set.insert(ColliderBuilder::cuboid(50.0, 0.1, 50.0).build());

        Self {
            ecs: hecs::World::new(),
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
            entities: Vec::new(),
            time: 0.0,
            gravity: Vec3::new(0.0, -9.81, 0.0),
            names: HashMap::new(),
            scripts: HashMap::new(),
            world_script: None,
            time_scale: 1.0,
            input: InputState::default(),
            input_map: InputMap::default(),
            collider_to_entity: HashMap::new(),
            collision_events: CollisionEventBuffer::default(),
            last_script_error: None,
            camera: RuntimeCamera::default(),
            show_grid: false,
            sim_vars: HashMap::new(),
            sim_seed: 1,
            rng_state: 1,
            projectiles: Vec::new(),
            project_dir: None,
        }
    }

    pub fn set_gravity(&mut self, gravity: Vec3) {
        self.gravity = gravity;
    }

    pub fn gravity(&self) -> Vec3 {
        self.gravity
    }

    pub fn entity_by_name(&self, name: &str) -> Option<Entity> {
        self.names.get(name).copied()
    }

    /// All named entities for picking / debugging.
    pub fn named_entities(&self) -> Vec<(String, Entity)> {
        self.names.iter().map(|(name, &entity)| (name.clone(), entity)).collect()
    }

    /// Axis-aligned half extents used for rendering and screen picking.
    pub fn render_half_extents(&self, entity: Entity) -> Vec3 {
        if let Ok(scale) = self.ecs.get::<&RenderScale>(entity) {
            return scale.0 * 0.5;
        }
        if let Ok(bounds) = self.ecs.get::<&PickBounds>(entity) {
            return bounds.0;
        }
        Vec3::splat(0.5)
    }

    pub fn entity_by_tag(&self, tag: &str) -> Option<Entity> {
        for &entity in &self.entities {
            if let Ok(tags) = self.ecs.get::<&EntityTags>(entity) {
                if tags.0.iter().any(|t| t == tag) {
                    return Some(entity);
                }
            }
        }
        None
    }

    pub fn set_tags(&mut self, entity: Entity, tags: Vec<String>) {
        if self.ecs.get::<&EntityTags>(entity).is_ok() {
            if let Ok(mut existing) = self.ecs.get::<&mut EntityTags>(entity) {
                existing.0 = tags;
            }
        } else {
            let _ = self.ecs.insert_one(entity, EntityTags(tags));
        }
    }

    /// Attaches design metadata (generic key/value — no domain semantics).
    pub fn set_properties(&mut self, entity: Entity, properties: HashMap<String, Value>) {
        if properties.is_empty() {
            return;
        }
        if self.ecs.get::<&Properties>(entity).is_ok() {
            if let Ok(mut existing) = self.ecs.get::<&mut Properties>(entity) {
                existing.0 = properties;
            }
        } else {
            let _ = self.ecs.insert_one(entity, Properties(properties));
        }
    }

    pub fn entity_properties(&self, entity: Entity) -> Option<HashMap<String, Value>> {
        self.ecs.get::<&Properties>(entity).ok().map(|p| p.0.clone())
    }

    pub fn named_properties(&self) -> HashMap<String, HashMap<String, Value>> {
        self.names
            .iter()
            .filter_map(|(name, &entity)| {
                self.entity_properties(entity)
                    .map(|props| (name.clone(), props.clone()))
            })
            .collect()
    }

    pub fn has_physics(&self, entity: Entity) -> bool {
        self.ecs.get::<&PhysicsBody>(entity).is_ok()
    }

    pub fn set_pick_bounds(&mut self, entity: Entity, half_extents: Vec3) {
        if self.ecs.get::<&PickBounds>(entity).is_ok() {
            if let Ok(mut existing) = self.ecs.get::<&mut PickBounds>(entity) {
                existing.0 = half_extents;
            }
        } else {
            let _ = self.ecs.insert_one(entity, PickBounds(half_extents));
        }
    }

    pub fn camera(&self) -> &RuntimeCamera {
        &self.camera
    }

    pub fn camera_mut(&mut self) -> &mut RuntimeCamera {
        &mut self.camera
    }

    pub fn set_project_dir(&mut self, dir: std::path::PathBuf) {
        self.project_dir = Some(dir);
    }

    pub fn project_dir(&self) -> Option<&std::path::Path> {
        self.project_dir.as_deref()
    }

    fn apply_world_control_patch(&mut self, patch: crate::script::WorldControlPatch) {
        if let Some(scale) = patch.time_scale {
            self.set_time_scale(scale);
        }
        if let Some(target) = patch.camera_target {
            self.camera.set_follow_target(target);
        }
        if let Some((prefab_name, x, y, z)) = patch.spawn_prefab {
            if let Some(dir) = self.project_dir.clone() {
                let path = dir.join("prefabs").join(format!("{prefab_name}.prefab.json"));
                match crate::prefab::load_prefab(&path) {
                    Ok(prefab) => {
                        crate::prefab::spawn_prefab_at(self, &prefab, Vec3::new(x as f32, y as f32, z as f32), &dir);
                    }
                    Err(err) => self.note_script_error(err),
                }
            }
        }
        if let Some((x, y, z, vx, vy, vz, lifetime)) = patch.spawn_projectile {
            self.spawn_projectile(
                Vec3::new(x as f32, y as f32, z as f32),
                Vec3::new(vx as f32, vy as f32, vz as f32),
                lifetime as f32,
                0.15,
                Vec3::new(1.0, 0.9, 0.2),
            );
        }
    }

    fn merge_sim_var_patch(&mut self, patch: HashMap<String, f64>) {
        for (key, value) in patch {
            self.sim_vars.insert(key, value);
        }
    }

    pub fn set_show_grid(&mut self, show: bool) {
        self.show_grid = show;
    }

    pub fn show_grid(&self) -> bool {
        self.show_grid
    }

    pub fn rotation_euler(&self, entity: Entity) -> Vec3 {
        if let Ok(body) = self.ecs.get::<&PhysicsBody>(entity) {
            let q = self.rigid_body_set[body.0].rotation();
            let (y, x, z) = q.to_euler(EulerRot::YXZ);
            return Vec3::new(x, y, z);
        }
        let transform = self.ecs.get::<&Transform>(entity).expect("rotation_euler: no transform");
        let (y, x, z) = transform.rotation.to_euler(EulerRot::YXZ);
        Vec3::new(x, y, z)
    }

    pub fn linear_velocity(&self, entity: Entity) -> Vec3 {
        if let Ok(body) = self.ecs.get::<&PhysicsBody>(entity) {
            let v = self.rigid_body_set[body.0].linvel();
            return Vec3::new(v.x, v.y, v.z);
        }
        Vec3::ZERO
    }

    pub fn entity_names(&self) -> Vec<String> {
        self.names.keys().cloned().collect()
    }

    pub fn body_type_of(&self, entity: Entity) -> BodyType {
        let Some(body) = self.ecs.get::<&PhysicsBody>(entity).ok() else {
            return BodyType::None;
        };
        match self.rigid_body_set[body.0].body_type() {
            RigidBodyType::Dynamic => BodyType::Dynamic,
            RigidBodyType::Fixed => BodyType::Fixed,
            RigidBodyType::KinematicPositionBased | RigidBodyType::KinematicVelocityBased => BodyType::Kinematic,
        }
    }

    pub fn set_entity_transform(&mut self, entity: Entity, position: Vec3, rotation_euler: Vec3, velocity: Vec3) {
        let handle = self.ecs.get::<&PhysicsBody>(entity).expect("set_entity_transform: no body").0;
        let body = &mut self.rigid_body_set[handle];
        body.set_translation(position, true);
        body.set_rotation(Quat::from_euler(EulerRot::YXZ, rotation_euler.y, rotation_euler.x, rotation_euler.z), true);
        body.set_linvel(velocity, true);
        if let Ok(mut transform) = self.ecs.get::<&mut Transform>(entity) {
            transform.translation = position;
            transform.rotation = Quat::from_euler(EulerRot::YXZ, rotation_euler.y, rotation_euler.x, rotation_euler.z);
        }
    }

    /// Spawns a short-lived kinematic sphere projectile.
    pub fn spawn_projectile(&mut self, position: Vec3, velocity: Vec3, lifetime: f32, radius: f32, color: Vec3) -> Entity {
        let entity = self.spawn_named(
            EntitySpec {
                position,
                velocity,
                body_type: BodyType::Kinematic,
                shape: Shape::Sphere { radius },
                color,
                sensor: false,
                ..Default::default()
            },
            None,
        );
        self.projectiles.push(Projectile {
            entity,
            velocity,
            lifetime,
            age: 0.0,
        });
        entity
    }

    pub fn set_time_scale(&mut self, scale: f32) {
        self.time_scale = scale.max(0.0);
    }

    pub fn time_scale(&self) -> f32 {
        self.time_scale
    }

    /// All named entities and their current positions (for script snapshots).
    pub fn named_positions(&self) -> HashMap<String, Vec3> {
        self.names
            .iter()
            .map(|(name, &entity)| (name.clone(), self.position(entity)))
            .collect()
    }

    pub fn named_rotations(&self) -> HashMap<String, Vec3> {
        self.names
            .iter()
            .map(|(name, &entity)| (name.clone(), self.rotation_euler(entity)))
            .collect()
    }

    pub fn tag_index(&self) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for &entity in &self.entities {
            if let Ok(tags) = self.ecs.get::<&EntityTags>(entity) {
                let name = self.entity_label(entity);
                for tag in &tags.0 {
                    map.entry(tag.clone()).or_insert_with(|| name.clone());
                }
            }
        }
        map
    }

    pub fn set_input_map(&mut self, map: InputMap) {
        self.input_map = map;
    }

    pub fn input_map(&self) -> &InputMap {
        &self.input_map
    }

    pub fn input(&self) -> &InputState {
        &self.input
    }

    pub fn input_mut(&mut self) -> &mut InputState {
        &mut self.input
    }

    pub fn last_script_error(&self) -> Option<&str> {
        self.last_script_error.as_deref()
    }

    fn entity_label(&self, entity: Entity) -> String {
        if let Ok(name) = self.ecs.get::<&EntityName>(entity) {
            return name.0.clone();
        }
        self.entities
            .iter()
            .position(|&e| e == entity)
            .map(|i| format!("entity_{i}"))
            .unwrap_or_else(|| "unknown".to_string())
    }

    fn note_script_error(&mut self, message: String) {
        eprintln!("{message}");
        self.last_script_error = Some(message);
    }

    fn record_collision_pair(&mut self, h1: ColliderHandle, h2: ColliderHandle, started: bool) {
        let (Some(&e1), Some(&e2)) = (self.collider_to_entity.get(&h1), self.collider_to_entity.get(&h2)) else {
            return;
        };
        let name1 = self.entity_label(e1);
        let name2 = self.entity_label(e2);
        self.collision_events.push(
            e1,
            crate::events::CollisionEvent {
                other_name: name2.clone(),
                started,
            },
        );
        self.collision_events.push(
            e2,
            crate::events::CollisionEvent {
                other_name: name1,
                started,
            },
        );
    }

    pub fn spawn(&mut self, spec: EntitySpec) -> Entity {
        self.spawn_named(spec, None)
    }

    /// Spawns a scene object with only a `Transform` (and optional name).
    pub fn spawn_empty(&mut self, name: Option<String>) -> Entity {
        let entity = self
            .ecs
            .spawn((Transform {
                translation: Vec3::ZERO,
                rotation: Quat::IDENTITY,
            },));
        self.entities.push(entity);
        if let Some(name) = name {
            self.ecs
                .insert_one(entity, EntityName(name.clone()))
                .expect("entity was just spawned, must still exist");
            self.names.insert(name, entity);
        }
        entity
    }

    pub fn set_transform(&mut self, entity: Entity, position: Vec3, rotation_euler: Vec3) {
        let rotation = Quat::from_euler(EulerRot::YXZ, rotation_euler.y, rotation_euler.x, rotation_euler.z);
        if let Ok(mut transform) = self.ecs.get::<&mut Transform>(entity) {
            transform.translation = position;
            transform.rotation = rotation;
        }
        if let Ok(body) = self.ecs.get::<&PhysicsBody>(entity) {
            self.rigid_body_set[body.0].set_translation(position, true);
            self.rigid_body_set[body.0].set_rotation(rotation, true);
        }
    }

    pub fn attach_transform(&mut self, entity: Entity, spec: TransformSpec) {
        self.set_transform(entity, spec.position, spec.rotation);
    }

    pub fn attach_physics(&mut self, entity: Entity, spec: &PhysicsSpec) {
        if spec.body_type == BodyType::None {
            return;
        }
        let rigid_body_builder = match spec.body_type {
            BodyType::Dynamic => RigidBodyBuilder::dynamic(),
            BodyType::Fixed => RigidBodyBuilder::fixed(),
            BodyType::Kinematic => RigidBodyBuilder::kinematic_position_based(),
            BodyType::None => return,
        };
        let position = self.position(entity);
        let rotation_euler = self.rotation_euler(entity);
        let rigid_body = rigid_body_builder
            .translation(position)
            .rotation(rotation_euler)
            .linvel(spec.velocity)
            .build();
        let handle = self.rigid_body_set.insert(rigid_body);

        let collider = match spec.shape {
            Shape::Cuboid { half_extents } => ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z),
            Shape::Sphere { radius } => ColliderBuilder::ball(radius),
        };
        let mut collider = collider.restitution(spec.restitution).friction(spec.friction);
        if spec.body_type == BodyType::Dynamic {
            collider = collider.mass(spec.mass);
        }
        if spec.sensor {
            collider = collider.sensor(true);
        }
        let layer = Group::from_bits_truncate(1u32 << (spec.collision_layer.min(15)));
        let mask = Group::from_bits_truncate(spec.collision_mask as u32);
        collider = collider.collision_groups(InteractionGroups::new(layer, mask, InteractionTestMode::default()));
        collider = collider.active_collision_types(
            ActiveCollisionTypes::default() | ActiveCollisionTypes::KINEMATIC_FIXED,
        );
        collider = collider.active_events(ActiveEvents::COLLISION_EVENTS);
        let collider = collider.build();
        let collider_handle = self
            .collider_set
            .insert_with_parent(collider, handle, &mut self.rigid_body_set);
        self.ecs
            .insert_one(entity, PhysicsBody(handle))
            .expect("attach_physics: entity must exist");
        self.ecs
            .insert_one(entity, PhysicsCollider(collider_handle))
            .expect("attach_physics: entity must exist");
        self.collider_to_entity.insert(collider_handle, entity);
    }

    pub fn attach_render(&mut self, entity: Entity, spec: RenderSpec) {
        if self.ecs.get::<&Tint>(entity).is_ok() {
            if let Ok(mut tint) = self.ecs.get::<&mut Tint>(entity) {
                tint.0 = spec.color;
            }
        } else {
            let _ = self.ecs.insert_one(entity, Tint(spec.color));
        }
        if self.ecs.get::<&RenderMesh>(entity).is_ok() {
            if let Ok(mut mesh) = self.ecs.get::<&mut RenderMesh>(entity) {
                mesh.0 = spec.mesh_kind;
            }
        } else {
            let _ = self.ecs.insert_one(entity, RenderMesh(spec.mesh_kind));
        }
        if self.ecs.get::<&RenderScale>(entity).is_ok() {
            if let Ok(mut scale) = self.ecs.get::<&mut RenderScale>(entity) {
                scale.0 = spec.scale;
            }
        } else {
            let _ = self.ecs.insert_one(entity, RenderScale(spec.scale));
        }
    }

    pub fn spawn_named(&mut self, spec: EntitySpec, name: Option<String>) -> Entity {
        if spec.body_type == BodyType::None {
            let entity = self.spawn_empty(name);
            self.set_transform(entity, spec.position, spec.rotation);
            let (mesh_kind, scale) = render_parts_from_shape(&spec.shape, spec.render_override);
            self.attach_render(
                entity,
                RenderSpec {
                    color: spec.color,
                    mesh_kind,
                    scale,
                },
            );
            return entity;
        }

        let entity = self.spawn_empty(name);
        self.attach_transform(
            entity,
            TransformSpec {
                position: spec.position,
                rotation: spec.rotation,
            },
        );
        self.attach_physics(
            entity,
            &PhysicsSpec {
                body_type: spec.body_type,
                shape: spec.shape,
                restitution: spec.restitution,
                velocity: spec.velocity,
                sensor: spec.sensor,
                mass: spec.mass,
                friction: spec.friction,
                collision_layer: spec.collision_layer,
                collision_mask: spec.collision_mask,
            },
        );
        let (mesh_kind, scale) = render_parts_from_shape(&spec.shape, spec.render_override);
        self.attach_render(
            entity,
            RenderSpec {
                color: spec.color,
                mesh_kind,
                scale,
            },
        );
        entity
    }

    /// Same as `spawn`, but attaches a `Behavior` that runs every step.
    pub fn spawn_with_behavior(&mut self, spec: EntitySpec, behavior: impl Behavior) -> Entity {
        self.spawn_with_behavior_named(spec, None, behavior)
    }

    pub fn spawn_with_behavior_named(
        &mut self,
        spec: EntitySpec,
        name: Option<String>,
        behavior: impl Behavior,
    ) -> Entity {
        let entity = self.spawn_named(spec, name);
        self.ecs.insert_one(entity, BehaviorSlot(Box::new(behavior))).expect("entity was just spawned, must still exist");
        entity
    }

    /// Attaches scripted sinusoidal motion to a (typically `Kinematic`)
    /// entity: `origin + axis.normalize() * amplitude * sin(time *
    /// speed)`, applied via `set_next_kinematic_translation` each step. A
    /// convenience for the common "moving platform" case — a `Behavior`
    /// can do anything more elaborate.
    pub fn add_motion(&mut self, entity: Entity, origin: Vec3, axis: Vec3, amplitude: f32, speed: f32) {
        self.ecs.insert_one(entity, Motion { origin, axis, amplitude, speed }).expect("add_motion: entity does not exist");
    }

    /// Attaches a project-local Rhai script to an entity (typically kinematic).
    pub fn attach_script(&mut self, entity: Entity, script: EntityScript) {
        self.scripts.insert(entity, script);
    }

    /// Attaches a world-level Rhai script (`on_world_update`).
    pub fn attach_world_script(&mut self, script: WorldScript) {
        self.world_script = Some(script);
    }

    /// A real rapier3d constraint between two spawned entities, looked up
    /// by their `PhysicsBody` component. Panics if either entity wasn't
    /// spawned via this `World`.
    pub fn add_joint(&mut self, entity1: Entity, entity2: Entity, kind: JointKind) {
        let body1 = self.ecs.get::<&PhysicsBody>(entity1).expect("add_joint: entity1 has no PhysicsBody").0;
        let body2 = self.ecs.get::<&PhysicsBody>(entity2).expect("add_joint: entity2 has no PhysicsBody").0;
        match kind {
            JointKind::Revolute { axis, anchor1, anchor2 } => {
                let data = RevoluteJointBuilder::new(axis).local_anchor1(anchor1).local_anchor2(anchor2).build();
                self.impulse_joint_set.insert(body1, body2, data, true);
            }
            JointKind::Fixed { anchor1, anchor2 } => {
                let data = FixedJointBuilder::new().local_anchor1(anchor1).local_anchor2(anchor2).build();
                self.impulse_joint_set.insert(body1, body2, data, true);
            }
        }
    }

    pub fn entity_count(&self) -> usize {
        self.entities.len()
    }

    /// Current world position of a spawned entity — useful for a
    /// `Behavior` that needs another entity's location (e.g. a "chase").
    pub fn position(&self, entity: Entity) -> Vec3 {
        self.ecs.get::<&Transform>(entity).expect("position: entity has no Transform").translation
    }

    /// Base physics timestep in seconds (`rapier3d::IntegrationParameters::dt`).
    /// Effective per-step dt is `step_dt()` (= `fixed_dt() * time_scale()`).
    pub fn fixed_dt(&self) -> f32 {
        self.integration_parameters.dt
    }

    /// Timestep applied each `step()` after `time_scale`.
    pub fn step_dt(&self) -> f32 {
        self.integration_parameters.dt * self.time_scale
    }

    /// Running simulation clock (sum of `step_dt()` over all steps taken).
    pub fn sim_time(&self) -> f32 {
        self.time
    }

    pub fn sim_var(&self, key: &str) -> f64 {
        self.sim_vars.get(key).copied().unwrap_or(0.0)
    }

    pub fn set_sim_var(&mut self, key: impl Into<String>, value: f64) {
        self.sim_vars.insert(key.into(), value);
    }

    pub fn sim_vars(&self) -> &HashMap<String, f64> {
        &self.sim_vars
    }

    /// Snapshot of runtime scalars for headless tests and shells (same store as `sim_var`).
    pub fn sim_metrics(&self) -> HashMap<String, f64> {
        self.sim_vars.clone()
    }

    pub fn sim_seed(&self) -> u64 {
        self.sim_seed
    }

    pub fn set_sim_seed(&mut self, seed: u64) {
        self.sim_seed = seed;
        self.rng_state = seed;
    }

    pub(crate) fn set_rng_state(&mut self, state: u64) {
        self.rng_state = state;
    }

    /// Advances the simulation by `steps` fixed-timestep ticks.
    pub fn step_n(&mut self, steps: u32) {
        for _ in 0..steps {
            self.step();
        }
    }

    pub fn step(&mut self) {
        let dt = self.integration_parameters.dt * self.time_scale;
        self.time += dt;
        let time = self.time;
        let snapshot = WorldSnapshot::from_world(self);
        let input_snapshot = crate::input::InputSnapshot::new(&self.input, &self.input_map);
        crate::script::install_input_snapshot(&input_snapshot);
        crate::script::install_sim_vars(&self.sim_vars);
        crate::script::install_rng_state(self.rng_state);

        if let Some(script) = &mut self.world_script {
            if let Some(err) = script.apply(dt, time, &snapshot) {
                self.note_script_error(err);
            }
            let patch = take_world_control_patch();
            self.apply_world_control_patch(patch);
            self.merge_sim_var_patch(crate::script::take_sim_var_patch());
        }

        crate::script::install_sim_vars(&self.sim_vars);

        // Scripted kinematic motion — set each Motion entity's target
        // position before the physics step, same pattern rapier3d's own
        // kinematic examples use (the pipeline consumes
        // set_next_kinematic_translation during this step, not the next).
        let mut kinematic_targets = Vec::new();
        for &entity in &self.entities {
            if let Ok(motion) = self.ecs.get::<&Motion>(entity) {
                let Some(body_handle) = self.ecs.get::<&PhysicsBody>(entity).ok().map(|b| b.0) else {
                    continue;
                };
                let offset = motion.axis.normalize_or_zero() * motion.amplitude * (time * motion.speed).sin();
                kinematic_targets.push((body_handle, motion.origin + offset));
            }
        }
        for (handle, target) in kinematic_targets {
            self.rigid_body_set[handle].set_next_kinematic_translation(target);
        }

        // Project Rhai scripts — same ordering as `Motion`/`Behavior`.
        let mut script_updates = Vec::new();
        for &entity in &self.entities {
            if self.scripts.contains_key(&entity) {
                script_updates.push(entity);
            }
        }
        for entity in script_updates {
            if let Some(script) = self.scripts.get_mut(&entity) {
                let err = if let Ok(body) = self.ecs.get::<&PhysicsBody>(entity) {
                    script.apply(dt, time, &mut self.rigid_body_set[body.0], &snapshot)
                } else if let Ok(mut transform) = self.ecs.get::<&mut Transform>(entity) {
                    script.apply_transform(dt, time, &mut transform, &snapshot)
                } else {
                    None
                };
                if let Some(err) = err {
                    self.note_script_error(err);
                }
                let patch = take_world_control_patch();
                self.apply_world_control_patch(patch);
            }
        }
        self.merge_sim_var_patch(crate::script::take_sim_var_patch());
        self.rng_state = crate::script::take_rng_state();

        // User Behaviors — also before the physics step, so anything they
        // set on the rigid body is consumed this step.
        for &entity in &self.entities {
            let Some(body_handle) = self.ecs.get::<&PhysicsBody>(entity).ok().map(|b| b.0) else {
                continue;
            };
            if let Ok(mut slot) = self.ecs.get::<&mut BehaviorSlot>(entity) {
                let rigid_body = &mut self.rigid_body_set[body_handle];
                let mut ctx = UpdateCtx { entity, dt, time, rigid_body };
                slot.0.update(&mut ctx);
            }
        }

        let gravity = self.gravity;
        let mut step_params = self.integration_parameters;
        step_params.dt = dt;
        let (collision_send, collision_recv) = std::sync::mpsc::channel();
        let (force_send, _force_recv) = std::sync::mpsc::channel();
        let event_handler = ChannelEventCollector::new(collision_send, force_send);
        self.physics_pipeline.step(
            gravity,
            &step_params,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            &(),
            &event_handler,
        );

        self.collision_events.clear();
        while let Ok(event) = collision_recv.try_recv() {
            match event {
                CollisionEvent::Started(h1, h2, _) => {
                    self.record_collision_pair(h1, h2, true);
                }
                CollisionEvent::Stopped(h1, h2, _) => {
                    self.record_collision_pair(h1, h2, false);
                }
            }
        }

        for &entity in &self.entities {
            let Some(body_handle) = self.ecs.get::<&PhysicsBody>(entity).ok().map(|b| b.0) else {
                continue;
            };
            let body = &self.rigid_body_set[body_handle];
            let t = body.translation();
            let r = body.rotation();
            let mut transform = self.ecs.get::<&mut Transform>(entity).unwrap();
            transform.translation = t;
            transform.rotation = *r;
        }

        // Collision script callbacks — after physics, before input end_frame.
        let mut collision_callbacks = Vec::new();
        for &entity in &self.entities {
            if self.scripts.contains_key(&entity) {
                let events = self.collision_events.drain_for(entity);
                if events.is_empty() {
                    continue;
                }
                let Some(body_handle) = self.ecs.get::<&PhysicsBody>(entity).ok().map(|b| b.0) else {
                    continue;
                };
                collision_callbacks.push((entity, body_handle, events));
            }
        }
        let mut script_errors = Vec::new();
        for (entity, body_handle, events) in collision_callbacks {
            if let Some(script) = self.scripts.get_mut(&entity) {
                for event in events {
                    if let Some(err) = script.apply_collision(
                        &event.other_name,
                        event.started,
                        &mut self.rigid_body_set[body_handle],
                        &snapshot,
                    ) {
                        script_errors.push(err);
                    }
                }
            }
        }
        for err in script_errors {
            self.note_script_error(err);
        }

        self.update_projectiles(dt);
        self.input.end_frame();
    }

    fn update_projectiles(&mut self, dt: f32) {
        let mut expired = Vec::new();
        for proj in &mut self.projectiles {
            proj.age += dt;
            if proj.age >= proj.lifetime {
                expired.push(proj.entity);
                continue;
            }
            let handle = self.ecs.get::<&PhysicsBody>(proj.entity).unwrap().0;
            let pos = self.rigid_body_set[handle].translation();
            let next = pos + proj.velocity * dt;
            self.rigid_body_set[handle].set_next_kinematic_translation(next);
        }
        self.projectiles.retain(|p| p.age < p.lifetime);
        for entity in expired {
            self.despawn(entity);
        }
    }

    /// Removes an entity from the simulation (physics + ECS).
    pub fn despawn(&mut self, entity: Entity) {
        if let Ok(body) = self.ecs.get::<&PhysicsBody>(entity) {
            let collider = self.ecs.get::<&PhysicsCollider>(entity).ok().map(|c| c.0);
            if let Some(ch) = collider {
                self.collider_set.remove(ch, &mut self.island_manager, &mut self.rigid_body_set, true);
                self.collider_to_entity.remove(&ch);
            }
            self.rigid_body_set.remove(
                body.0,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                true,
            );
        }
        if let Ok(name) = self.ecs.get::<&EntityName>(entity) {
            self.names.remove(&name.0);
        }
        self.scripts.remove(&entity);
        self.entities.retain(|&e| e != entity);
        let _ = self.ecs.despawn(entity);
    }

    /// (model matrix, tint, mesh kind) per entity, in a stable order —
    /// what `crate::render::render_frame` actually draws each tick.
    pub fn draw_list(&self) -> Vec<(Mat4, Vec3, MeshKind)> {
        self.entities
            .iter()
            .filter_map(|&entity| {
                let transform = self.ecs.get::<&Transform>(entity).ok()?;
                let tint = self.ecs.get::<&Tint>(entity).ok()?;
                let mesh_kind = self.ecs.get::<&RenderMesh>(entity).ok()?.0;
                let scale = self
                    .ecs
                    .get::<&RenderScale>(entity)
                    .map(|s| s.0)
                    .unwrap_or(Vec3::ONE);
                Some((
                    Mat4::from_scale_rotation_translation(scale, transform.rotation, transform.translation),
                    tint.0,
                    mesh_kind,
                ))
            })
            .collect()
    }
}

fn render_parts_from_shape(shape: &Shape, render_override: Option<MeshKind>) -> (MeshKind, Vec3) {
    let default_mesh_kind = match shape {
        Shape::Cuboid { .. } => MeshKind::Cube,
        Shape::Sphere { .. } => MeshKind::Sphere,
    };
    let mesh_kind = render_override.unwrap_or(default_mesh_kind);
    let scale = match shape {
        Shape::Cuboid { half_extents } => *half_extents * 2.0,
        Shape::Sphere { radius } => Vec3::splat(*radius * 2.0),
    };
    (mesh_kind, scale)
}
