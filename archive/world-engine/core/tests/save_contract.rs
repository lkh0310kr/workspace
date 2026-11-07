//! Phase 21 / 38 — snapshot save/load round-trip.

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
fn snapshot_includes_sim_vars_and_rng_state() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-rng-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = world_engine_core::load_scene(&dir);
    let mut world = world_engine_core::build_world(&scene, None, Some(std::path::Path::new(&dir)));
    world.set_sim_var("stock", 42.0);
    world.step_n(10);
    let snap = world.snapshot();
    assert_eq!(snap.sim_vars.get("stock").copied(), Some(42.0));
    assert!(snap.rng_state != snap.sim_seed, "RNG stream should advance after scripted steps");
    assert_eq!(snap.sim_seed, 4242);
}

#[test]
fn restore_rng_state_continues_deterministically() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-rng-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = world_engine_core::load_scene(&dir);
    let path = std::path::Path::new(&dir);

    let mut baseline = world_engine_core::build_world(&scene, None, Some(path));
    baseline.step_n(180);
    let rng_end = baseline.rng_state();

    let mut checkpoint = world_engine_core::build_world(&scene, None, Some(path));
    checkpoint.step_n(120);
    let snap = checkpoint.snapshot();

    let mut fork = world_engine_core::build_world(&scene, None, Some(path));
    fork.restore(&snap);
    assert_eq!(fork.rng_state(), snap.rng_state);
    fork.step_n(60);

    assert_eq!(
        fork.rng_state(),
        rng_end,
        "RNG stream should match uninterrupted run (script locals are not checkpointed)"
    );
}

#[test]
fn json_round_trip_preserves_sim_vars() {
    let mut world = World::new_empty();
    world.set_sim_var("alpha", 1.5);
    world.set_sim_time(3.25);
    let json = world.save_to_json().expect("serialize");
    let expected_rng = world.rng_state();

    let mut restored = World::new_empty();
    restored.restore_from_json(&json).expect("restore");
    assert_eq!(restored.sim_var("alpha"), 1.5);
    assert_eq!(restored.rng_state(), expected_rng);
    assert!((restored.sim_time() - 3.25).abs() < 1e-6);
}

#[test]
fn checkpoint_demo_fixture_loads() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-checkpoint-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = world_engine_core::load_scene(&dir);
    let world = world_engine_core::build_world(&scene, None, Some(std::path::Path::new(&dir)));
    assert!(world.entity_by_name("player").is_some());
}
