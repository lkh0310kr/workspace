let x = 0.0;

fn on_update(dt, time, px, py, pz) {
    x += rand_range(-1.0, 1.0) * dt;
    return [x, py, pz];
}
