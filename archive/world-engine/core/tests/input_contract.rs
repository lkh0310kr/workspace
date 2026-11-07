//! Phase 14 — input map, axis, pressed/down, Rhai bindings.

use world_engine_core::input::{InputMap, InputState};
use world_engine_core::scene::{build_world, load_scene};

#[test]
fn input_axis_resolves_opposing_keys() {
    let map = InputMap::from_json(&serde_json::json!({
        "move_x": { "negative": "A", "positive": "D" }
    })
    .as_object()
    .unwrap()
    .iter()
    .map(|(k, v)| (k.clone(), v.clone()))
    .collect());
    let mut state = InputState::default();
    state.key_down("D");
    assert_eq!(map.axis(&state, "move_x"), 1.0);
}

#[test]
fn fly_script_moves_with_simulated_input() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-fly-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("scripts/fly.rhai").exists() {
        return;
    }

    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    let flyer = world.entity_by_name("flyer").expect("flyer");

    world.input_mut().key_down("D");
    world.step_n(60);
    let pos = world.position(flyer);
    assert!(pos.x > 0.5, "holding D should move +X, got {pos:?}");

    let start_x = pos.x;
    world.input_mut().key_up("D");
    world.input_mut().key_down("A");
    world.step_n(60);
    let pos = world.position(flyer);
    assert!(pos.x < start_x, "holding A should move -X from {start_x}, got {pos:?}");
}

#[test]
fn fly_demo_fixture_has_input_map() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-fly-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = load_scene(&dir);
    assert!(scene.input_map.is_some());
}
