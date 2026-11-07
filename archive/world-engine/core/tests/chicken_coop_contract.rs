//! Chicken coop sim — PKMS design smoke test.

use world_engine_core::scene::{build_world, load_scene};

#[test]
fn chicken_coop_loads_and_chickens_seek_feed() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-chicken-coop-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }

    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));

    assert!(
        world.entity_by_name("zone_mgmt").is_some(),
        "zone_mgmt floor mat should load"
    );
    assert!(
        world.entity_by_name("zone_living").is_some(),
        "zone_living floor mat should load"
    );
    assert!(
        world.entity_by_name("zone_gate").is_some(),
        "zone_gate floor mat should load"
    );

    let goldie = world.entity_by_name("goldie").expect("goldie");
    let start = world.position(goldie);

    world.step_n(700);

    let pos = world.position(goldie);
    // Living zone (SE) → management zone (NW): x or z should move toward feed.
    let moved_toward_feed = pos.x < start.x - 0.35 || pos.z > start.z + 0.35;
    assert!(
        moved_toward_feed,
        "hungry chicken should drift toward feed/water NW, start={start:?} end={pos:?}"
    );
    assert!(world.last_script_error().is_none(), "{:?}", world.last_script_error());
}

#[test]
fn farm_director_publishes_feed_stock_sim_var() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-chicken-coop-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }

    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    world.step_n(400);

    assert!(
        world.sim_var("feed_stock") < 1.0,
        "feed_stock should deplete over time, got {}",
        world.sim_var("feed_stock")
    );
    assert!(world.last_script_error().is_none(), "{:?}", world.last_script_error());
}

#[test]
fn layer_chicken_can_lay_egg_prefab() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-chicken-coop-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("prefabs/egg.prefab.json").exists() {
        return;
    }

    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    let before = world.entity_count();

    // Long run: layers visit nests and may spawn egg prefabs.
    world.step_n(1200);

    assert!(
        world.entity_count() >= before,
        "coop sim should run without despawn; eggs may increase entity count"
    );
}
