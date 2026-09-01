let saved_y = 1.0;

fn on_update(dt, time, x, y, z) {
    let mx = input_axis("move_x");
    let nx = x + mx * 4.0 * dt;
    let ny = y;
    if input_pressed("jump") {
        saved_y = 2.5;
    }
    if ny < saved_y {
        saved_y = ny;
    }
    return [nx, saved_y, z];
}

fn on_collision(other, started, x, y, z) {
    if other == "checkpoint" && started {
        saved_y = 3.0;
    }
}
