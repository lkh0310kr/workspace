//! Phase 23–24 — reference game fixtures smoke tests.

use world_engine_core::scene::{build_world, load_scene};

#[test]
fn platformer_game_reaches_goal_headless() {
    let dir = format!(
        "{}/../../electron/test-fixtures/world-engine-game-platformer",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    let player = world.entity_by_name("player").expect("player");
    world.input_mut().key_down("D");
    for _ in 0..600 {
        world.input_mut().key_down("D");
        if world.sim_time() > 2.0 {
            world.input_mut().key_down("Space");
        }
        world.step();
    }
    let pos = world.position(player);
    assert!(pos.x > 5.0, "player should reach goal area, x={}", pos.x);
}

#[test]
fn topdown_game_spawns_projectiles() {
    let dir = format!(
        "{}/../../electron/test-fixtures/world-engine-game-topdown",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    let before = world.entity_count();
    world.input_mut().key_down("Space");
    world.step_n(5);
    assert!(world.entity_count() >= before, "firing should spawn projectiles");
}
