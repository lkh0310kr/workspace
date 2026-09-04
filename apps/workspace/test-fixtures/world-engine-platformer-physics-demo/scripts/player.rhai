let vy = 0.0;
let grounded = false;
let dead = false;

fn on_update(dt, time, x, y, z) {
    if dead {
        return [x, y, z];
    }
    let mx = input_axis("move_x");
    let nx = x + mx * 6.0 * dt;
    vy -= 20.0 * dt;
    if input_pressed("jump") && grounded {
        vy = 7.5;
        grounded = false;
    }
    let ny = if (y + vy * dt) < 0.6 { 0.6 } else { y + vy * dt };
    if ny <= 0.61 {
        vy = 0.0;
        grounded = true;
    }
    return [nx, ny, z];
}

fn on_collision(other, started, x, y, z) {
    if started && other == "hazard" {
        dead = true;
    }
    if started && other == "goal" {
        dead = false;
        vy = 0.0;
    }
}
