let goal_reached = false;

fn on_update(dt, time, x, y, z) {
    let mx = input_axis("move_x");
    let mz = input_axis("move_z");
    let nx = x + mx * speed * dt;
    let nz = z + mz * speed * dt;
    if goal_reached {
        return [nx, 1.5, nz];
    }
    return [nx, y, nz];
}

fn on_collision(other, started, x, y, z) {
    if other == "goal" && started {
        goal_reached = true;
    }
}
