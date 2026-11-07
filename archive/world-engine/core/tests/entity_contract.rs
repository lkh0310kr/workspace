//! Phase 17 — entity rotation, tags, 6-element kinematic return.

use world_engine_core::scene::{build_world, load_scene};
use world_engine_core::{BodyType, EntitySpec, Shape, World};

#[test]
fn entity_with_tag_resolves_first_match() {
    let mut world = World::new_empty();
    world.set_gravity([0.0, 0.0, 0.0].into());
    let a = world.spawn_named(EntitySpec::default(), Some("a".into()));
    let b = world.spawn_named(EntitySpec::default(), Some("b".into()));
    world.set_tags(a, vec!["player".into()]);
    world.set_tags(b, vec!["player".into()]);
    assert_eq!(world.entity_by_tag("player"), Some(a));
}

#[test]
fn turret_demo_tracks_target_yaw() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-turret-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("scripts/turret.rhai").exists() {
        return;
    }
    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    let turret = world.entity_by_name("turret").expect("turret");
    for _ in 0..120 {
        world.step();
    }
    let rot = world.rotation_euler(turret);
    assert!(rot.y.abs() > 0.1, "turret should yaw toward target, got {rot:?}");
}
