//! Kernel invariants — object model, step loop smoke (Lab track foundation).

use world_engine_core::scene::{build_world, load_scene};
use world_engine_core::{BodyType, EntitySpec, World};

#[test]
fn body_type_none_has_no_physics() {
    let mut world = World::new_empty();
    let marker = world.spawn_named(
        EntitySpec {
            position: [0.0, 0.0, 0.0].into(),
            body_type: BodyType::None,
            ..Default::default()
        },
        Some("marker".into()),
    );
    assert!(!world.has_physics(marker));
    world.step_n(1);
    assert!(world.last_script_error().is_none());
}

#[test]
fn spawn_empty_without_render_has_empty_draw_list() {
    let mut world = World::new_empty();
    let _marker = world.spawn_empty(Some("marker".into()));
    assert_eq!(world.draw_list().len(), 0);
}

#[test]
fn step_advances_sim_time_by_step_dt() {
    let mut world = World::new_empty();
    let dt = world.step_dt();
    assert_eq!(world.sim_time(), 0.0);
    world.step();
    assert!((world.sim_time() - dt).abs() < 1e-6);
}

#[test]
fn set_sim_time_clamps_negative_to_zero() {
    let mut world = World::new_empty();
    world.set_sim_time(-5.0);
    assert_eq!(world.sim_time(), 0.0);
}

#[test]
fn composition_marker_fixture_spawns_without_physics() {
    let dir = format!(
        "{}/../../electron/test-fixtures/world-engine-composition-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    let path = std::path::Path::new(&dir).join("world-engine-flat-equiv.json");
    if !path.exists() {
        return;
    }
    let contents = std::fs::read_to_string(&path).unwrap();
    let scene: world_engine_core::SceneFile = serde_json::from_str(&contents).unwrap();
    let world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    let marker = world.entity_by_name("zone_marker").unwrap();
    assert!(!world.has_physics(marker));
}

#[test]
fn rng_fixture_loads_without_script_errors() {
    let dir = format!(
        "{}/../../electron/test-fixtures/world-engine-rng-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&dir).join("world-engine.json").exists() {
        return;
    }
    let scene = load_scene(&dir);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    world.step_n(60);
    assert!(world.last_script_error().is_none(), "{:?}", world.last_script_error());
}
