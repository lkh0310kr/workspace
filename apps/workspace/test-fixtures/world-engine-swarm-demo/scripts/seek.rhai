// Boids-lite: seek a named leader each frame.
fn on_update(dt, time, x, y, z) {
    let t = entity_pos(target);
    if t.len() < 3 {
        return [x, y, z];
    }
    let tx = t[0];
    let ty = t[1];
    let tz = t[2];
    let dx = tx - x;
    let dy = ty - y;
    let dz = tz - z;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    if dist < 0.15 {
        return [x, y, z];
    }
    let step = speed * dt;
    let scale = if step >= dist { 1.0 } else { step / dist };
    return [x + dx * scale, y + dy * scale, z + dz * scale];
}
