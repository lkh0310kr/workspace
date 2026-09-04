//! Phase 22 — collision layers filter interactions.

use world_engine_core::{BodyType, EntitySpec, Shape, World};

#[test]
fn disjoint_layers_pass_through() {
    let mut world = World::new_empty();
    world.set_gravity([0.0, 0.0, 0.0].into());
    world.spawn_named(
        EntitySpec {
            position: [0.0, 2.0, 0.0].into(),
            body_type: BodyType::Fixed,
            shape: Shape::Cuboid {
                half_extents: [0.5, 0.5, 0.5].into(),
            },
            collision_layer: 1,
            collision_mask: 1,
            ..Default::default()
        },
        Some("wall".into()),
    );
    let ball = world.spawn_named(
        EntitySpec {
            position: [-3.0, 2.0, 0.0].into(),
            velocity: [8.0, 0.0, 0.0].into(),
            body_type: BodyType::Dynamic,
            shape: Shape::Sphere { radius: 0.3 },
            collision_layer: 2,
            collision_mask: 2,
            ..Default::default()
        },
        Some("ball".into()),
    );
    for _ in 0..120 {
        world.step();
    }
    let x = world.position(ball).x;
    assert!(x > 0.5, "layer-2 ball should pass through layer-1 wall, x={x}");
}
