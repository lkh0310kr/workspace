//! Phase 34 — entity properties smoke tests.

use world_engine_core::scene::{build_world, load_scene};
use world_engine_core::World;

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/world-engine-properties-demo"
);

#[test]
fn properties_injected_into_own_script_scope() {
    let path = std::path::Path::new(FIXTURE).join("world-engine.json");
    if !path.exists() {
        return;
    }
    let scene = load_scene(FIXTURE);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(FIXTURE)));
    world.step_n(30);
    assert!(world.last_script_error().is_none(), "{:?}", world.last_script_error());
    let hen_a = world.position(world.entity_by_name("hen_a").unwrap());
    assert!(hen_a.x > -2.0, "hunger property should drive motion: {hen_a:?}");
}

#[test]
fn entity_property_visible_to_entry_script() {
    let path = std::path::Path::new(FIXTURE).join("world-engine.json");
    if !path.exists() {
        return;
    }
    let scene = load_scene(FIXTURE);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(FIXTURE)));
    world.step_n(10);
    let metrics = world.sim_metrics();
    assert_eq!(metrics.get("peer_breed").copied(), Some(1.0));
    assert_eq!(metrics.get("hen_a_hunger").copied(), Some(0.5));
}
