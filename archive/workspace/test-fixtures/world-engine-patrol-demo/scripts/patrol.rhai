// Waypoint patrol with persistent index (Unity NavMesh-lite / Godot PathFollow).
let wp_idx = 0;

fn on_update(dt, time, x, y, z) {
    if waypoints.len() == 0 {
        return [x, y, z];
    }
    let wp = waypoints[wp_idx];
    let tx = wp[0];
    let ty = wp[1];
    let tz = wp[2];
    let dx = tx - x;
    let dy = ty - y;
    let dz = tz - z;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    if dist < 0.25 {
        wp_idx = (wp_idx + 1) % waypoints.len();
        return [x, y, z];
    }
    let step = speed * dt;
    let scale = if step >= dist { 1.0 } else { step / dist };
    return [x + dx * scale, y + dy * scale, z + dz * scale];
}
