//! Phase 32 — sim_metrics / publish_metric smoke tests.

use world_engine_core::scene::{build_world, load_scene};
use world_engine_core::World;

#[test]
fn sim_metrics_returns_rust_set_vars() {
    let mut world = World::new_empty();
    world.set_sim_var("alpha", 1.25);
    let metrics = world.sim_metrics();
    assert_eq!(metrics.get("alpha").copied(), Some(1.25));
}

#[test]
fn entry_script_publish_metric_visible_in_sim_metrics() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-chicken-coop-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }

    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    world.step_n(60);

    let metrics = world.sim_metrics();
    assert!(
        metrics.contains_key("feed_stock"),
        "farm_director should publish feed_stock, keys={metrics:?}"
    );
    assert!(
        metrics.contains_key("water_stock"),
        "farm_director should publish water_stock, keys={metrics:?}"
    );
    assert!(world.last_script_error().is_none(), "{:?}", world.last_script_error());
}
