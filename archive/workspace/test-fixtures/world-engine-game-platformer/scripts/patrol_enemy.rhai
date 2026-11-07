let dir = 1.0;

fn on_update(dt, time, x, y, z) {
    let nx = x + dir * 2.0 * dt;
    if nx > 6.0 || nx < 2.0 {
        dir = -dir;
    }
    return [nx, y, z];
}
