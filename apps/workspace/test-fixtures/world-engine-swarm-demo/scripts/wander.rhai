// Lissajous-style wander for the swarm leader.
fn on_update(dt, time, x, y, z) {
    let nx = radius * (time * speed * 0.7).sin();
    let nz = radius * (time * speed).cos();
    return [nx, height, nz];
}
