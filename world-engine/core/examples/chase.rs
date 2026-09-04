//! Proves the code-facing SDK API actually works: builds a `World`
//! entirely in code (no JSON, no window, no Qt) and steps it headless,
//! printing entity positions. A `ChaseBehavior` moves a kinematic entity
//! toward a fixed target each frame via `UpdateCtx::rigid_body` — real
//! per-frame logic the declarative JSON scene format has no way to
//! express (its only scripted motion is sinusoidal oscillation around a
//! fixed origin — see `world-engine.json`'s `motion` field).
//!
//! Run with: `cargo run --example chase`

use glam::Vec3;
use world_engine_core::{Behavior, BodyType, EntitySpec, Shape, UpdateCtx, World};

struct ChaseBehavior {
    target: Vec3,
    speed: f32,
}

impl Behavior for ChaseBehavior {
    fn update(&mut self, ctx: &mut UpdateCtx) {
        let current = ctx.rigid_body.translation();
        let to_target = self.target - current;
        let step_len = (self.speed * ctx.dt).min(to_target.length());
        let next = current + to_target.normalize_or_zero() * step_len;
        ctx.rigid_body.set_next_kinematic_translation(next);
    }
}

fn main() {
    let mut world = World::new_empty();

    let target = Vec3::new(5.0, 1.0, 0.0);
    world.spawn(EntitySpec { position: target, body_type: BodyType::Fixed, shape: Shape::Sphere { radius: 0.3 }, ..Default::default() });

    let chaser = world.spawn_with_behavior(
        EntitySpec { position: Vec3::new(-5.0, 1.0, 0.0), body_type: BodyType::Kinematic, shape: Shape::Sphere { radius: 0.3 }, ..Default::default() },
        ChaseBehavior { target, speed: 3.0 },
    );

    println!("headless chase — no window, no JSON, both entities built entirely in code");
    println!("target fixed at {target:?}");
    for step in 0..250 {
        world.step();
        if step % 40 == 0 {
            let pos = world.position(chaser);
            println!("step {step:>3}: chaser at ({:.2}, {:.2}, {:.2})", pos.x, pos.y, pos.z);
        }
    }
    let final_pos = world.position(chaser);
    let distance = (target - final_pos).length();
    println!("final: chaser at ({:.2}, {:.2}, {:.2}) — distance to target: {distance:.3}", final_pos.x, final_pos.y, final_pos.z);
    assert!(distance < 0.1, "ChaseBehavior did not converge on the target — the Behavior hook isn't actually driving the rigid body");
    println!("OK — the Behavior hook drove real rigid-body motion toward the target.");
}
