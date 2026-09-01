// Yaw-only turret tracking — Phase 17 entity_rot + 6-element kinematic return.

fn on_update(dt, time, x, y, z) {
    let target_name = entity_with_tag("target");
    if target_name == "" {
        return [x, y, z, 0.0, 0.0, 0.0];
    }
    let tp = entity_pos(target_name);
    if tp.len() < 3 {
        return [x, y, z, 0.0, 0.0, 0.0];
    }
    let dx = tp[0] - x;
    let dz = tp[2] - z;
    let yaw = yaw_from_delta(dx, dz);
    return [x, y, z, 0.0, yaw, 0.0];
}
