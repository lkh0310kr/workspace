//! Phase 36 — pause / simulation clock control.

use world_engine_core::{BodyType, EntitySpec, Shape, World};

#[test]
fn paused_step_does_not_advance_sim_time() {
    let mut world = World::new_empty();
    world.set_paused(true);
    let t0 = world.sim_time();
    world.step_n(10);
    assert_eq!(world.sim_time(), t0);
}

#[test]
fn unpaused_step_resumes_clock() {
    let mut world = World::new_empty();
    world.set_paused(true);
    world.step_n(5);
    world.set_paused(false);
    let dt = world.step_dt();
    world.step();
    assert!((world.sim_time() - dt).abs() < 1e-6);
}

#[test]
fn paused_skips_physics_motion() {
    let mut world = World::new_empty();
    world.spawn_named(
        EntitySpec {
            position: [0.0, 5.0, 0.0].into(),
            body_type: BodyType::Dynamic,
            shape: Shape::Sphere { radius: 0.5 },
            ..Default::default()
        },
        Some("ball".into()),
    );
    world.set_paused(true);
    world.step_n(30);
    let y = world.named_positions().get("ball").map(|p| p.y).unwrap_or(0.0);
    assert!((y - 5.0).abs() < 0.01, "ball should not fall while paused: {y}");
}

#[test]
fn step_n_still_calls_step_while_paused() {
    let mut world = World::new_empty();
    world.set_paused(true);
    assert!(world.is_paused());
    world.step_n(3);
    assert!(world.is_paused());
}
