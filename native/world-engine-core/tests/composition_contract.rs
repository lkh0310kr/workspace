//! Phase 41 — composition / SDK alignment smoke tests.

use std::fs;

use serde_json::Value;
use world_engine_core::pick::pick_entity_at_screen;
use world_engine_core::scene::{build_world, load_scene, lower_entity_def, spawn_from_blueprint, SceneFile};
use world_engine_core::World;

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../electron/test-fixtures/world-engine-composition-demo"
);

fn load_scene_file(path: &str) -> SceneFile {
    let contents = fs::read_to_string(path).expect("read scene");
    serde_json::from_str(&contents).expect("parse scene")
}

#[test]
fn body_type_none_spawns_without_physics_or_render() {
    let path = format!("{FIXTURE}/world-engine-flat-equiv.json");
    if !std::path::Path::new(&path).exists() {
        return;
    }
    let scene = load_scene_file(&path);
    let mut world = build_world(&scene, None, Some(std::path::Path::new(FIXTURE)));
    let marker = world.entity_by_name("zone_marker").unwrap();
    assert!(!world.has_physics(marker));
    assert_eq!(world.draw_list().len(), 1, "only walker should render");
}

#[test]
fn components_array_lowers_to_same_marker_properties() {
    let components_path = format!("{FIXTURE}/world-engine.json");
    let flat_path = format!("{FIXTURE}/world-engine-flat-equiv.json");
    if !std::path::Path::new(&components_path).exists() {
        return;
    }
    let components_scene = load_scene_file(&components_path);
    let flat_scene = load_scene_file(&flat_path);

    let comp_bp = lower_entity_def(&components_scene.entities[0], None);
    let flat_bp = lower_entity_def(&flat_scene.entities[0], None);
    assert_eq!(comp_bp.properties.get("zone").and_then(Value::as_str), Some("management"));
    assert_eq!(flat_bp.properties.get("zone").and_then(Value::as_str), Some("management"));
    assert!(comp_bp.physics.is_none());
    assert!(flat_bp.physics.is_none());
}

#[test]
fn flat_and_components_scenes_match_walker_position_after_steps() {
    let components_path = format!("{FIXTURE}/world-engine.json");
    let flat_path = format!("{FIXTURE}/world-engine-flat-equiv.json");
    if !std::path::Path::new(&components_path).exists() {
        return;
    }
    let project = std::path::Path::new(FIXTURE);

    let mut components_world = build_world(&load_scene_file(&components_path), None, Some(project));
    components_world.step_n(60);
    let comp_x = components_world.position(components_world.entity_by_name("walker").unwrap());

    let mut flat_world = build_world(&load_scene_file(&flat_path), None, Some(project));
    flat_world.step_n(60);
    let flat_x = flat_world.position(flat_world.entity_by_name("walker").unwrap());

    assert!((comp_x.x - flat_x.x).abs() < 1e-4, "{comp_x:?} vs {flat_x:?}");
}

#[test]
fn pick_bounds_on_marker_without_render_mesh() {
    let path = format!("{FIXTURE}/world-engine-flat-equiv.json");
    if !std::path::Path::new(&path).exists() {
        return;
    }
    let scene = load_scene_file(&path);
    let world = build_world(&scene, None, Some(std::path::Path::new(FIXTURE)));
    let hit = pick_entity_at_screen(&world, glam::Vec3::new(0.0, 5.0, 8.0), glam::Vec3::ZERO, 60.0, 1.0, 400.0, 300.0, 800.0, 600.0);
    assert_eq!(hit.map(|h| h.name), Some("zone_marker".to_string()));
}

#[test]
fn spawn_from_blueprint_matches_legacy_entity_spec_count() {
    let mut world = World::new_empty();
    let def = load_scene(FIXTURE).entities.into_iter().find(|e| e.name.as_deref() == Some("walker"));
    let Some(def) = def else {
        return;
    };
    let blueprint = lower_entity_def(&def, None);
    spawn_from_blueprint(&mut world, &blueprint, glam::Vec3::ZERO, Some(std::path::Path::new(FIXTURE)));
    assert_eq!(world.entity_count(), 1);
}
