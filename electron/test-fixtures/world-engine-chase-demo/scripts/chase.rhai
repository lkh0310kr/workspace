// Seek a named target entity (Godot get_node / Unity Find pattern).
fn on_update(dt, time, x, y, z) {
    let t = entity_pos("target");
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
    if dist < 0.001 {
        return [x, y, z];
    }
    let step = speed * dt;
    if step >= dist {
        return [tx, ty, tz];
    }
    let scale = step / dist;
    return [x + dx * scale, y + dy * scale, z + dz * scale];
}
