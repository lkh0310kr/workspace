fn on_update(dt, time, x, y, z) {
    let player = entity_with_tag("player");
    if player == "" {
        return [x, y, z];
    }
    let p = entity_pos(player);
    let dx = p[0] - x;
    let dz = p[2] - z;
    let dist = (dx * dx + dz * dz).sqrt();
    if dist < 0.01 {
        return [x, y, z];
    }
    let step = 2.5 * dt;
    let scale = if step >= dist { 1.0 } else { step / dist };
    return [x + dx * scale, y, z + dz * scale];
}
