//! Phase 13 — simulation contract: fixed timestep, initial velocity, determinism.

use glam::Vec3;
use world_engine_core::scene::{build_world, load_scene};
use world_engine_core::{BodyType, EntitySpec, Shape, World};

fn ballistic_position_after_steps(steps: u32) -> Vec3 {
    let mut world = World::new_empty();
    world.set_gravity(Vec3::ZERO);
    let body = world.spawn(EntitySpec {
        position: Vec3::new(1.0, 2.0, 3.0),
        velocity: Vec3::new(4.0, 5.0, 6.0),
        body_type: BodyType::Dynamic,
        shape: Shape::Sphere { radius: 0.3 },
        ..Default::default()
    });
    world.step_n(steps);
    world.position(body)
}

#[test]
fn simulation_is_deterministic_over_fixed_steps() {
    let a = ballistic_position_after_steps(100);
    let b = ballistic_position_after_steps(100);
    assert!(
        (a - b).length() < 1e-6,
        "same spawn + same steps must yield identical positions (a={a:?}, b={b:?})"
    );
}

#[test]
fn zero_gravity_ballistic_matches_analytic() {
    let steps = 120u32;
    let mut world = World::new_empty();
    world.set_gravity(Vec3::ZERO);
    let spawn = Vec3::new(0.0, 5.0, -2.0);
    let vel = Vec3::new(3.0, 1.5, 2.0);
    let body = world.spawn(EntitySpec {
        position: spawn,
        velocity: vel,
        body_type: BodyType::Dynamic,
        shape: Shape::Sphere { radius: 0.25 },
        ..Default::default()
    });
    world.step_n(steps);

    let expected = spawn + vel * (world.step_dt() * steps as f32);
    let actual = world.position(body);
    assert!(
        (actual - expected).length() < 0.02,
        "expected {expected:?}, got {actual:?}"
    );
}

#[test]
fn drop_demo_fixture_loads_with_velocity() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-drop-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    let scene_path = std::path::Path::new(&dir).join("world-engine.json");
    if !scene_path.exists() {
        return;
    }

    let scene = load_scene(&dir);
    let world = build_world(&scene, None, Some(std::path::Path::new(&dir)));
    assert_eq!(world.entity_count(), 1);

    let mut world = world;
    let projectile = world.entity_by_name("projectile").expect("named projectile");
    let before = world.position(projectile);
    world.step_n(30);
    let after = world.position(projectile);
    assert!(after.y < before.y || after.x > before.x, "projectile should move from initial velocity + gravity");
}
