// WASD fly — click the window first so it has keyboard focus.
fn on_update(dt, time, x, y, z) {
    let mx = input_axis("move_x");
    let mz = input_axis("move_z");
    let ny = if input_down("up") {
        y + speed * dt
    } else if input_down("down") {
        y - speed * dt
    } else {
        y
    };
    let nx = x + mx * speed * dt;
    let nz = z + mz * speed * dt;
    return [nx, ny, nz];
}
