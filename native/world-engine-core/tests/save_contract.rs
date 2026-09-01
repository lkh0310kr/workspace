//! Phase 21 — snapshot save/load round-trip.

use world_engine_core::{BodyType, EntitySpec, Shape, World};

#[test]
fn snapshot_restore_round_trip() {
    let mut world = World::new_empty();
    world.set_gravity([0.0, 0.0, 0.0].into());
    let player = world.spawn_named(
        EntitySpec {
            position: [1.0, 2.0, 3.0].into(),
            body_type: BodyType::Dynamic,
            shape: Shape::Sphere { radius: 0.3 },
            velocity: [0.5, 0.0, 0.0].into(),
            ..Default::default()
        },
        Some("player".into()),
    );
    world.step_n(30);
    let snap = world.snapshot();
    let json = world.save_to_json().expect("serialize");
    world.set_entity_transform(player, [9.0, 9.0, 9.0].into(), [0.0; 3].into(), [0.0; 3].into());
    world.restore_from_json(&json).expect("restore");
    let pos = world.position(player);
    let saved = snap.entities.iter().find(|e| e.name.as_deref() == Some("player")).unwrap();
    assert!((pos.x - saved.position[0]).abs() < 0.5);
}

#[test]
fn checkpoint_demo_fixture_loads() {
    let dir = format!(
        "{}/../../electron/test-fixtures/world-engine-checkpoint-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = world_engine_core::load_scene(&dir);
    let world = world_engine_core::build_world(&scene, None, Some(std::path::Path::new(&dir)));
    assert!(world.entity_by_name("player").is_some());
}
