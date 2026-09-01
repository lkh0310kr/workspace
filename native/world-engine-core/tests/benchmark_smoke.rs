//! Phase 29 — headless performance smoke (not a CI gate).

use world_engine_core::{BodyType, EntitySpec, Shape, World};

#[test]
fn five_hundred_bodies_step_under_budget() {
    let mut world = World::new_empty();
    world.set_gravity([0.0, -9.81, 0.0].into());
    for i in 0..500 {
        let x = (i % 25) as f32 * 0.5 - 6.0;
        let z = (i / 25) as f32 * 0.5 - 6.0;
        world.spawn(EntitySpec {
            position: [x, 2.0 + (i % 10) as f32 * 0.2, z].into(),
            body_type: BodyType::Dynamic,
            shape: Shape::Sphere { radius: 0.15 },
            ..Default::default()
        });
    }
    let start = std::time::Instant::now();
    world.step_n(60);
    let elapsed = start.elapsed();
    assert!(
        elapsed.as_secs_f32() < 5.0,
        "500 bodies × 60 steps should finish <5s on dev hardware, took {:?}",
        elapsed
    );
}
