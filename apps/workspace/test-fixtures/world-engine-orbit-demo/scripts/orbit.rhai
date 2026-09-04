// Circular orbit around a named center (Kerbal / Unity orbit-lite).
fn on_update(dt, time, x, y, z) {
    let c = entity_pos(center_name);
    let cx = if c.len() >= 1 { c[0] } else { 0.0 };
    let cy = if c.len() >= 2 { c[1] } else { center_y };
    let cz = if c.len() >= 3 { c[2] } else { 0.0 };
    let angle = time * speed;
    let nx = cx + radius * angle.cos();
    let nz = cz + radius * angle.sin();
    return [nx, cy, nz];
}
