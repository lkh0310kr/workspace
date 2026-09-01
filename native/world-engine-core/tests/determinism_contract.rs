//! Phase 33 — sim_seed / Rhai RNG determinism smoke tests.

use world_engine_core::scene::{build_world, load_scene};
use world_engine_core::World;

const RNG_FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../electron/test-fixtures/world-engine-rng-demo"
);

fn fixture_dir() -> Option<String> {
    let path = std::path::Path::new(RNG_FIXTURE).join("world-engine.json");
    if path.exists() {
        Some(RNG_FIXTURE.to_string())
    } else {
        None
    }
}

fn walker_x(world: &World) -> f32 {
    world
        .named_positions()
        .get("walker")
        .map(|p| p.x)
        .unwrap_or(0.0)
}

#[test]
fn default_sim_seed_is_one_when_json_omits_field() {
    let world = World::new_empty();
    assert_eq!(world.sim_seed(), 1);

    let scene = load_scene(&format!(
        "{}/../../electron/test-fixtures/world-engine-spawner-demo",
        env!("CARGO_MANIFEST_DIR")
    ));
    let built = build_world(&scene, None, None);
    assert_eq!(built.sim_seed(), 1);
}

#[test]
fn json_sim_seed_initializes_world_rng() {
    let Some(dir) = fixture_dir() else {
        return;
    };
    let scene = load_scene(&dir);
    let world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    assert_eq!(world.sim_seed(), 4242);
}

#[test]
fn same_seed_same_step_n_produces_identical_metrics_and_position() {
    let Some(dir) = fixture_dir() else {
        return;
    };
    let scene = load_scene(&dir);
    let path = std::path::Path::new(&dir);

    let mut a = build_world(&scene, None, Some(path));
    a.step_n(120);
    let sum_a = a.sim_metrics().get("rng_sum").copied().unwrap_or(0.0);
    let x_a = walker_x(&a);

    let mut b = build_world(&scene, None, Some(path));
    b.step_n(120);
    let sum_b = b.sim_metrics().get("rng_sum").copied().unwrap_or(0.0);
    let x_b = walker_x(&b);

    assert_eq!(sum_a, sum_b, "rng_sum should be deterministic");
    assert!((x_a - x_b).abs() < 1e-6, "walker x should match: {x_a} vs {x_b}");
    assert!(a.last_script_error().is_none(), "{:?}", a.last_script_error());
    assert!(b.last_script_error().is_none(), "{:?}", b.last_script_error());
}

#[test]
fn different_seed_diverges_after_step_n() {
    let Some(dir) = fixture_dir() else {
        return;
    };
    let scene = load_scene(&dir);
    let path = std::path::Path::new(&dir);

    let mut a = build_world(&scene, None, Some(path));
    a.set_sim_seed(4242);
    a.step_n(120);
    let sum_a = a.sim_metrics().get("rng_sum").copied().unwrap_or(0.0);

    let mut b = build_world(&scene, None, Some(path));
    b.set_sim_seed(9999);
    b.step_n(120);
    let sum_b = b.sim_metrics().get("rng_sum").copied().unwrap_or(0.0);

    assert_ne!(sum_a, sum_b, "different seeds should diverge: {sum_a} vs {sum_b}");
}
