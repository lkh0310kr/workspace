fn on_update(dt, time, x, y, z) {
    let mx = input_axis("move_x");
    let mz = input_axis("move_z");
    let nx = x + mx * 6.0 * dt;
    let nz = z + mz * 6.0 * dt;
    if input_pressed("fire") {
        spawn_projectile(x, 0.5, z, mx * 12.0, 0.0, mz * 12.0, 2.0);
    }
    return [nx, y, nz];
}
