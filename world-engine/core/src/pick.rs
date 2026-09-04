//! Screen-space ray picking — AABB (markers) and physics colliders (Phase 35).

use glam::Vec3;

use crate::world::World;

/// Closest named entity hit along a viewport ray (AABB).
#[derive(Clone, Debug, PartialEq)]
pub struct PickHit {
    pub name: String,
    pub distance: f32,
}

/// Closest physics hit along a world-space ray.
#[derive(Clone, Debug, PartialEq)]
pub struct RayHit {
    pub name: String,
    pub distance: f32,
    pub point: Vec3,
}

/// Cast a ray through a screen pixel; returns the closest named entity (AABB).
pub fn pick_entity_at_screen(
    world: &World,
    eye: Vec3,
    look_at: Vec3,
    fov_deg: f32,
    aspect: f32,
    screen_x: f32,
    screen_y: f32,
    viewport_w: f32,
    viewport_h: f32,
) -> Option<PickHit> {
    let (eye, ray_dir) = screen_ray(eye, look_at, fov_deg, aspect, screen_x, screen_y, viewport_w, viewport_h)?;
    pick_entity_along_ray_aabb(world, eye, ray_dir)
}

/// Physics pick with AABB fallback for entities without colliders (markers).
pub fn pick_entity_at_screen_physics(
    world: &World,
    eye: Vec3,
    look_at: Vec3,
    fov_deg: f32,
    aspect: f32,
    screen_x: f32,
    screen_y: f32,
    viewport_w: f32,
    viewport_h: f32,
) -> Option<PickHit> {
    let (eye, ray_dir) = screen_ray(eye, look_at, fov_deg, aspect, screen_x, screen_y, viewport_w, viewport_h)?;
    if let Some(hit) = world.raycast(eye, ray_dir, f32::MAX) {
        return Some(PickHit {
            name: hit.name,
            distance: hit.distance,
        });
    }
    pick_entity_along_ray_aabb(world, eye, ray_dir)
}

fn screen_ray(
    eye: Vec3,
    look_at: Vec3,
    fov_deg: f32,
    aspect: f32,
    screen_x: f32,
    screen_y: f32,
    viewport_w: f32,
    viewport_h: f32,
) -> Option<(Vec3, Vec3)> {
    if viewport_w <= 0.0 || viewport_h <= 0.0 {
        return None;
    }
    let forward = (look_at - eye).normalize_or_zero();
    if forward.length_squared() < 1e-6 {
        return None;
    }
    let right = forward.cross(Vec3::Y).normalize_or_zero();
    let up = if right.length_squared() < 1e-6 {
        Vec3::X
    } else {
        right.cross(forward).normalize()
    };
    let tan_half = (fov_deg.to_radians() * 0.5).tan();
    let ndc_x = (screen_x / viewport_w) * 2.0 - 1.0;
    let ndc_y = 1.0 - (screen_y / viewport_h) * 2.0;
    let ray_dir = (forward + right * ndc_x * tan_half * aspect + up * ndc_y * tan_half).normalize();
    Some((eye, ray_dir))
}

fn pick_entity_along_ray_aabb(world: &World, eye: Vec3, ray_dir: Vec3) -> Option<PickHit> {
    let mut best: Option<PickHit> = None;
    for (name, entity) in world.named_entities() {
        let pos = world.position(entity);
        let half = world.render_half_extents(entity);
        if let Some(distance) = ray_aabb(pos, half, eye, ray_dir) {
            if best.as_ref().is_none_or(|hit| distance < hit.distance) {
                best = Some(PickHit { name, distance });
            }
        }
    }
    best
}

fn ray_aabb(center: Vec3, half: Vec3, origin: Vec3, dir: Vec3) -> Option<f32> {
    let min = center - half;
    let max = center + half;
    let mut t_min = 0.0_f32;
    let mut t_max = f32::INFINITY;

    for axis in 0..3 {
        let (o, d, mn, mx) = match axis {
            0 => (origin.x, dir.x, min.x, max.x),
            1 => (origin.y, dir.y, min.y, max.y),
            _ => (origin.z, dir.z, min.z, max.z),
        };
        if d.abs() < 1e-8 {
            if o < mn || o > mx {
                return None;
            }
            continue;
        }
        let t1 = (mn - o) / d;
        let t2 = (mx - o) / d;
        let (near, far) = if t1 < t2 { (t1, t2) } else { (t2, t1) };
        t_min = t_min.max(near);
        t_max = t_max.min(far);
        if t_min > t_max {
            return None;
        }
    }
    if t_max < 0.0 {
        return None;
    }
    Some(if t_min < 0.0 { 0.0 } else { t_min })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::{BodyType, EntitySpec, Shape, World};

    #[test]
    fn picks_named_entity_in_front_of_camera() {
        let mut world = World::new_empty();
        world.spawn_named(
            EntitySpec {
                position: Vec3::new(0.0, 0.5, -3.0),
                shape: Shape::Cuboid {
                    half_extents: Vec3::splat(0.5),
                },
                body_type: BodyType::Fixed,
                ..EntitySpec::default()
            },
            Some("target".to_string()),
        );
        let hit = pick_entity_at_screen(
            &world,
            Vec3::new(0.0, 0.5, 0.0),
            Vec3::new(0.0, 0.5, -1.0),
            45.0,
            1.5,
            450.0,
            300.0,
            900.0,
            600.0,
        );
        assert_eq!(hit.as_ref().map(|h| h.name.as_str()), Some("target"));
    }
}
