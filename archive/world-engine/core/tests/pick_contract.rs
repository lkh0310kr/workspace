//! Phase 35 — physics raycast pick vs AABB occlusion.

use glam::Vec3;
use world_engine_core::pick::{pick_entity_at_screen, pick_entity_at_screen_physics};
use world_engine_core::{BodyType, EntitySpec, RenderSpec, Shape, World};

#[test]
fn raycast_hits_fixed_cuboid_along_axis() {
    let mut world = World::new_empty();
    world.spawn_named(
        EntitySpec {
            position: Vec3::new(0.0, 0.0, -4.0),
            shape: Shape::Cuboid {
                half_extents: Vec3::splat(0.5),
            },
            body_type: BodyType::Fixed,
            ..EntitySpec::default()
        },
        Some("block".into()),
    );
    world.step_n(1);
    let hit = world
        .raycast(Vec3::new(0.0, 0.0, 2.0), Vec3::new(0.0, 0.0, -1.0), 100.0)
        .expect("should hit block");
    assert_eq!(hit.name, "block");
    assert!((hit.distance - 5.5).abs() < 0.1, "distance {distance}", distance = hit.distance);
}

#[test]
fn physics_pick_prefers_occluding_cube_over_marker_aabb() {
    let mut world = World::new_empty();
    world.spawn_named(
        EntitySpec {
            position: Vec3::new(0.0, 0.0, -3.0),
            shape: Shape::Cuboid {
                half_extents: Vec3::new(0.5, 0.5, 0.5),
            },
            body_type: BodyType::Fixed,
            ..EntitySpec::default()
        },
        Some("front_cube".into()),
    );
    let marker = world.spawn_empty(Some("huge_marker".into()));
    world.set_transform(marker, Vec3::new(0.0, 0.0, -10.0), Vec3::ZERO);
    world.set_pick_bounds(marker, Vec3::new(20.0, 20.0, 20.0));
    world.step_n(1);

    let eye = Vec3::new(0.0, 0.0, 5.0);
    let look_at = Vec3::new(0.0, 0.0, -20.0);
    let aabb = pick_entity_at_screen(&world, eye, look_at, 60.0, 1.0, 400.0, 300.0, 800.0, 600.0)
        .expect("aabb should hit something");
    assert_eq!(aabb.name, "huge_marker", "AABB picks oversized marker bounds first");

    let physics = pick_entity_at_screen_physics(&world, eye, look_at, 60.0, 1.0, 400.0, 300.0, 800.0, 600.0)
        .expect("physics pick should hit cube");
    assert_eq!(physics.name, "front_cube");
}

#[test]
fn raycast_skips_entities_without_physics() {
    let mut world = World::new_empty();
    let marker = world.spawn_empty(Some("marker_only".into()));
    world.set_transform(marker, Vec3::new(0.0, 0.0, -2.0), Vec3::ZERO);
    world.attach_render(
        marker,
        RenderSpec {
            color: Vec3::new(1.0, 0.0, 0.0),
            mesh_kind: world_engine_core::MeshKind::Cube,
            scale: Vec3::splat(1.0),
        },
    );
    assert!(world
        .raycast(Vec3::ZERO, Vec3::new(0.0, 0.0, -1.0), 50.0)
        .is_none());
}
