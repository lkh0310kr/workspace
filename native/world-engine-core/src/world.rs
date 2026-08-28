//! The engine's ECS/physics `World` and the actual SDK surface: real code
//! hooks into a running world here (`spawn`/`spawn_with_behavior`, the
//! `Behavior` trait) — `crate::scene`'s JSON loader is a convenience layer
//! built on top of this, not a separate implementation.

use glam::{Mat4, Quat, Vec3};
use hecs::Entity;
use rapier3d::prelude::*;

pub struct Transform {
    pub translation: Vec3,
    pub rotation: Quat,
}
struct PhysicsBody(RigidBodyHandle);
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

#[derive(Clone, Copy, Default)]
pub enum BodyType {
    #[default]
    Dynamic,
    Fixed,
    Kinematic,
}

#[derive(Clone, Copy)]
pub enum Shape {
    Cuboid { half_extents: Vec3 },
    Sphere { radius: f32 },
}

/// The one real way to describe an entity, whether it comes from
/// hand-written game code or `crate::scene`'s JSON loader.
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
        }
    }

    pub fn spawn(&mut self, spec: EntitySpec) -> Entity {
        let rigid_body_builder = match spec.body_type {
            BodyType::Dynamic => RigidBodyBuilder::dynamic(),
            BodyType::Fixed => RigidBodyBuilder::fixed(),
            BodyType::Kinematic => RigidBodyBuilder::kinematic_position_based(),
        };
        let rigid_body = rigid_body_builder.translation(spec.position).rotation(spec.rotation).build();
        let handle = self.rigid_body_set.insert(rigid_body);

        let (collider, default_mesh_kind) = match spec.shape {
            Shape::Cuboid { half_extents } => (ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z), MeshKind::Cube),
            Shape::Sphere { radius } => (ColliderBuilder::ball(radius), MeshKind::Sphere),
        };
        let collider = collider.restitution(spec.restitution).build();
        self.collider_set.insert_with_parent(collider, handle, &mut self.rigid_body_set);

        let mesh_kind = spec.render_override.unwrap_or(default_mesh_kind);
        let entity = self.ecs.spawn((
            Transform { translation: Vec3::ZERO, rotation: Quat::IDENTITY },
            PhysicsBody(handle),
            Tint(spec.color),
            RenderMesh(mesh_kind),
        ));
        self.entities.push(entity);
        entity
    }

    /// Same as `spawn`, but attaches a `Behavior` that runs every step.
    pub fn spawn_with_behavior(&mut self, spec: EntitySpec, behavior: impl Behavior) -> Entity {
        let entity = self.spawn(spec);
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

    pub fn step(&mut self) {
        self.time += self.integration_parameters.dt;
        let dt = self.integration_parameters.dt;
        let time = self.time;

        // Scripted kinematic motion — set each Motion entity's target
        // position before the physics step, same pattern rapier3d's own
        // kinematic examples use (the pipeline consumes
        // set_next_kinematic_translation during this step, not the next).
        let mut kinematic_targets = Vec::new();
        for &entity in &self.entities {
            if let Ok(motion) = self.ecs.get::<&Motion>(entity) {
                let body_handle = self.ecs.get::<&PhysicsBody>(entity).unwrap().0;
                let offset = motion.axis.normalize_or_zero() * motion.amplitude * (time * motion.speed).sin();
                kinematic_targets.push((body_handle, motion.origin + offset));
            }
        }
        for (handle, target) in kinematic_targets {
            self.rigid_body_set[handle].set_next_kinematic_translation(target);
        }

        // User Behaviors — also before the physics step, so anything they
        // set on the rigid body is consumed this step.
        for &entity in &self.entities {
            let body_handle = self.ecs.get::<&PhysicsBody>(entity).unwrap().0;
            if let Ok(mut slot) = self.ecs.get::<&mut BehaviorSlot>(entity) {
                let rigid_body = &mut self.rigid_body_set[body_handle];
                let mut ctx = UpdateCtx { entity, dt, time, rigid_body };
                slot.0.update(&mut ctx);
            }
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
        for &entity in &self.entities {
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
    /// what `crate::render::render_frame` actually draws each tick.
    pub fn draw_list(&self) -> Vec<(Mat4, Vec3, MeshKind)> {
        self.entities
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
