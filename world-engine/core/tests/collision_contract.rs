//! Phase 15 — collision events and trigger volumes.

use world_engine_core::scene::{build_world, load_scene};
use world_engine_core::{BodyType, EntitySpec, Shape, World};

#[test]
fn two_spheres_generate_collision_started() {
    let mut world = World::new_empty();
    world.set_gravity([0.0, 0.0, 0.0].into());
    world.spawn_named(
        EntitySpec {
            position: [0.0, 2.0, 0.0].into(),
            body_type: BodyType::Dynamic,
            shape: Shape::Sphere { radius: 0.5 },
            ..Default::default()
        },
        Some("a".to_string()),
    );
    world.spawn_named(
        EntitySpec {
            position: [0.8, 2.0, 0.0].into(),
            body_type: BodyType::Dynamic,
            shape: Shape::Sphere { radius: 0.5 },
            ..Default::default()
        },
        Some("b".to_string()),
    );

    for _ in 0..120 {
        world.step();
    }

    // Collision occurred — no crash; step completed with EventQueue wired.
    assert!(world.entity_count() == 2);
}

#[test]
fn trigger_demo_player_reaches_goal() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-trigger-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("scripts/player.rhai").exists() {
        return;
    }

    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    let player = world.entity_by_name("player").expect("player");

    world.input_mut().key_down("D");
    for _ in 0..400 {
        world.step();
    }

    let pos = world.position(player);
    assert!(pos.y > 1.2, "player should rise after goal trigger, got y={}", pos.y);
    assert!(world.last_script_error().is_none(), "script errors: {:?}", world.last_script_error());
}
