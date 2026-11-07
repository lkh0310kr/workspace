let vy = 0.0;
let checkpoints = 0;
let won = false;

fn on_update(dt, time, x, y, z) {
    if won {
        return [x, 1.5, z, 0.0, 0.0, 0.0];
    }
    let mx = input_axis("move_x");
    let nx = x + mx * 7.0 * dt;
    vy -= 24.0 * dt;
    if input_pressed("jump") && y < 1.2 {
        vy = 9.0;
    }
    let ny = y + vy * dt;
    if ny < 0.7 {
        vy = 0.0;
    }
    return [nx, ny, z];
}

fn on_collision(other, started, x, y, z) {
    if !started {
        return;
    }
    if other == "goal" {
        won = true;
    }
    if other == "cp1" || other == "cp2" {
        checkpoints += 1;
    }
}
