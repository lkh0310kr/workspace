//! Scene object lowering — flat JSON or explicit `components[]` → SDK spawn.

use std::collections::HashMap;
use std::path::Path;

use glam::Vec3;
use serde::Deserialize;
use serde_json::Value;

use crate::script::{load_entity_script, ScriptMode};
use crate::world::{
    BodyType, MeshKind, PhysicsSpec, RenderSpec, Shape, TransformSpec, World,
};

use super::{BodyTypeDef, MotionDef, SceneEntityDef};

fn default_restitution() -> f32 {
    0.6
}

fn default_color() -> [f32; 3] {
    [0.9, 0.2, 0.2]
}

/// Lowered spawn description shared by `build_world`, prefabs, and tests.
#[derive(Clone, Debug)]
pub struct EntityBlueprint {
    pub name: Option<String>,
    pub transform: TransformSpec,
    pub physics: Option<PhysicsSpec>,
    pub render: Option<RenderSpec>,
    pub properties: HashMap<String, Value>,
    pub tags: Option<Vec<String>>,
    pub script: Option<String>,
    pub script_args: Option<Value>,
    pub script_mode: Option<String>,
    pub motion: Option<MotionDef>,
    pub pick_half_extents: Option<Vec3>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ComponentDef {
    Transform {
        #[serde(default)]
        position: [f32; 3],
        #[serde(default)]
        rotation: [f32; 3],
    },
    Properties {
        #[serde(default)]
        data: HashMap<String, Value>,
    },
    Physics {
        #[serde(default)]
        body_type: BodyTypeDef,
        shape: Option<String>,
        half_extents: Option<[f32; 3]>,
        radius: Option<f32>,
        #[serde(default = "default_restitution")]
        restitution: f32,
        #[serde(default)]
        velocity: Option<[f32; 3]>,
        #[serde(default)]
        trigger: bool,
        #[serde(default)]
        mass: Option<f32>,
        #[serde(default)]
        friction: Option<f32>,
        #[serde(default)]
        collision_layer: Option<u16>,
        #[serde(default)]
        collision_mask: Option<u16>,
    },
    Render {
        #[serde(default = "default_color")]
        color: [f32; 3],
        #[serde(default)]
        mesh: Option<String>,
        shape: Option<String>,
        half_extents: Option<[f32; 3]>,
        radius: Option<f32>,
    },
    Script {
        path: String,
        #[serde(default)]
        args: Option<Value>,
        #[serde(default)]
        mode: Option<String>,
    },
    Tags {
        values: Vec<String>,
    },
    Motion {
        #[serde(flatten)]
        motion: MotionDef,
    },
    #[serde(rename = "pick_bounds")]
    PickBounds {
        half_extents: [f32; 3],
    },
}

pub fn properties_map_from_value(value: Option<&Value>) -> HashMap<String, Value> {
    match value.and_then(|v| v.as_object()) {
        Some(map) => map.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        None => HashMap::new(),
    }
}

pub fn lower_entity_def(def: &SceneEntityDef, mesh_half_extents: Option<[f32; 3]>) -> EntityBlueprint {
    if let Some(components) = &def.components {
        return lower_from_components(def.name.clone(), components, mesh_half_extents);
    }
    lower_from_flat(def, mesh_half_extents)
}

fn lower_from_flat(def: &SceneEntityDef, mesh_half_extents: Option<[f32; 3]>) -> EntityBlueprint {
    let (shape, render_override) = match mesh_half_extents {
        Some(half_extents) => (
            Shape::Cuboid {
                half_extents: Vec3::from(half_extents),
            },
            Some(MeshKind::Loaded),
        ),
        None => (def.resolved_shape(), def.resolved_mesh_kind()),
    };
    let body_type = def.resolved_body_type();
    let physics = if body_type == BodyType::None {
        None
    } else {
        Some(PhysicsSpec {
            body_type,
            shape,
            restitution: def.restitution,
            velocity: def.velocity.map(Vec3::from).unwrap_or(Vec3::ZERO),
            sensor: def.trigger,
            mass: def.mass.unwrap_or(1.0),
            friction: def.friction.unwrap_or(0.5),
            collision_layer: def.collision_layer.unwrap_or(1),
            collision_mask: def.collision_mask.unwrap_or(0xFFFF),
        })
    };
    let render = if body_type == BodyType::None {
        None
    } else {
        let (mesh_kind, scale) = render_parts(&shape, render_override);
        Some(RenderSpec {
            color: Vec3::from(def.color),
            mesh_kind,
            scale,
        })
    };
    EntityBlueprint {
        name: def.name.clone(),
        transform: TransformSpec {
            position: Vec3::from(def.position),
            rotation: Vec3::from(def.rotation),
        },
        physics,
        render,
        properties: properties_map_from_value(def.properties.as_ref()),
        tags: def.tags.clone(),
        script: def.script.clone(),
        script_args: def.script_args.clone(),
        script_mode: def.script_mode.clone(),
        motion: def.motion,
        pick_half_extents: def.pick_half_extents.map(Vec3::from),
    }
}

fn lower_from_components(
    name: Option<String>,
    components: &[ComponentDef],
    mesh_half_extents: Option<[f32; 3]>,
) -> EntityBlueprint {
    let mut blueprint = EntityBlueprint {
        name,
        transform: TransformSpec {
            position: Vec3::ZERO,
            rotation: Vec3::ZERO,
        },
        physics: None,
        render: None,
        properties: HashMap::new(),
        tags: None,
        script: None,
        script_args: None,
        script_mode: None,
        motion: None,
        pick_half_extents: None,
    };

    for component in components {
        match component {
            ComponentDef::Transform { position, rotation } => {
                blueprint.transform = TransformSpec {
                    position: Vec3::from(*position),
                    rotation: Vec3::from(*rotation),
                };
            }
            ComponentDef::Properties { data } => {
                blueprint.properties.extend(data.clone());
            }
            ComponentDef::Physics {
                body_type,
                shape,
                half_extents,
                radius,
                restitution,
                velocity,
                trigger,
                mass,
                friction,
                collision_layer,
                collision_mask,
            } => {
                let pseudo = SceneEntityDef {
                    position: [0.0; 3],
                    rotation: [0.0; 3],
                    restitution: *restitution,
                    color: [0.9, 0.2, 0.2],
                    body_type: *body_type,
                    shape: shape.clone(),
                    half_extents: *half_extents,
                    radius: *radius,
                    motion: None,
                    name: None,
                    script: None,
                    script_args: None,
                    script_mode: None,
                    velocity: *velocity,
                    trigger: *trigger,
                    tags: None,
                    mesh: None,
                    mass: *mass,
                    friction: *friction,
                    collision_layer: *collision_layer,
                    collision_mask: *collision_mask,
                    properties: None,
                    components: None,
                    pick_half_extents: None,
                };
                let shape = if mesh_half_extents.is_some() {
                    Shape::Cuboid {
                        half_extents: Vec3::from(mesh_half_extents.unwrap()),
                    }
                } else {
                    pseudo.resolved_shape()
                };
                let resolved = pseudo.resolved_body_type();
                if resolved != BodyType::None {
                    blueprint.physics = Some(PhysicsSpec {
                        body_type: resolved,
                        shape,
                        restitution: *restitution,
                        velocity: velocity.map(Vec3::from).unwrap_or(Vec3::ZERO),
                        sensor: *trigger,
                        mass: mass.unwrap_or(1.0),
                        friction: friction.unwrap_or(0.5),
                        collision_layer: collision_layer.unwrap_or(1),
                        collision_mask: collision_mask.unwrap_or(0xFFFF),
                    });
                }
            }
            ComponentDef::Render {
                color,
                mesh,
                shape,
                half_extents,
                radius,
            } => {
                let pseudo = SceneEntityDef {
                    position: [0.0; 3],
                    rotation: [0.0; 3],
                    restitution: 0.6,
                    color: *color,
                    body_type: BodyTypeDef::Fixed,
                    shape: shape.clone(),
                    half_extents: *half_extents,
                    radius: *radius,
                    motion: None,
                    name: None,
                    script: None,
                    script_args: None,
                    script_mode: None,
                    velocity: None,
                    trigger: false,
                    tags: None,
                    mesh: mesh.clone(),
                    mass: None,
                    friction: None,
                    collision_layer: None,
                    collision_mask: None,
                    properties: None,
                    components: None,
                    pick_half_extents: None,
                };
                let shape = pseudo.resolved_shape();
                let (mesh_kind, scale) = render_parts(&shape, pseudo.resolved_mesh_kind());
                blueprint.render = Some(RenderSpec {
                    color: Vec3::from(*color),
                    mesh_kind,
                    scale,
                });
            }
            ComponentDef::Script { path, args, mode } => {
                blueprint.script = Some(path.clone());
                blueprint.script_args = args.clone();
                blueprint.script_mode = mode.clone();
            }
            ComponentDef::Tags { values } => {
                blueprint.tags = Some(values.clone());
            }
            ComponentDef::Motion { motion } => {
                blueprint.motion = Some(*motion);
            }
            ComponentDef::PickBounds { half_extents } => {
                blueprint.pick_half_extents = Some(Vec3::from(*half_extents));
            }
        }
    }

    if let Some(half) = mesh_half_extents {
        if blueprint.physics.is_none() {
            blueprint.physics = Some(PhysicsSpec {
                body_type: BodyType::Dynamic,
                shape: Shape::Cuboid {
                    half_extents: Vec3::from(half),
                },
                restitution: 0.6,
                velocity: Vec3::ZERO,
                sensor: false,
                mass: 1.0,
                friction: 0.5,
                collision_layer: 1,
                collision_mask: 0xFFFF,
            });
        }
        if blueprint.render.is_none() {
            blueprint.render = Some(RenderSpec {
                color: Vec3::new(0.9, 0.2, 0.2),
                mesh_kind: MeshKind::Loaded,
                scale: Vec3::from(half) * 2.0,
            });
        }
    }

    blueprint
}

fn render_parts(shape: &Shape, render_override: Option<MeshKind>) -> (MeshKind, Vec3) {
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

/// Spawns one scene object from a lowered blueprint (SDK entry point).
pub fn spawn_from_blueprint(
    world: &mut World,
    blueprint: &EntityBlueprint,
    origin: Vec3,
    project_dir: Option<&Path>,
) -> hecs::Entity {
    let mut transform = blueprint.transform;
    transform.position += origin;

    let entity = world.spawn_empty(blueprint.name.clone());
    world.attach_transform(entity, transform);

    if let Some(physics) = &blueprint.physics {
        world.attach_physics(entity, physics);
    }
    if let Some(render) = &blueprint.render {
        world.attach_render(entity, *render);
    }
    if !blueprint.properties.is_empty() {
        world.set_properties(entity, blueprint.properties.clone());
    }
    if let Some(tags) = &blueprint.tags {
        world.set_tags(entity, tags.clone());
    }
    if let Some(half) = blueprint.pick_half_extents {
        world.set_pick_bounds(entity, half);
    }
    if let (Some(dir), Some(script_rel)) = (project_dir, blueprint.script.as_deref()) {
        let mode = ScriptMode::parse(blueprint.script_mode.as_deref().unwrap_or("kinematic"));
        let props_value = if blueprint.properties.is_empty() {
            None
        } else {
            Some(Value::Object(
                blueprint.properties.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            ))
        };
        match load_entity_script(
            dir,
            script_rel,
            blueprint.script_args.as_ref(),
            props_value.as_ref(),
            mode,
        ) {
            Ok(script) => world.attach_script(entity, script),
            Err(err) => eprintln!("entity script error: {err}"),
        }
    }
    if let Some(motion) = blueprint.motion {
        world.add_motion(
            entity,
            transform.position,
            Vec3::from(motion.axis),
            motion.amplitude,
            motion.speed,
        );
    }
    entity
}
