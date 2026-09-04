fn on_update(dt, time, x, y, z) {
    let rate = hunger * 0.1;
    return [x + rate * dt, y, z];
}
