// Unity AddForce-style hover thruster on a dynamic body.
fn on_update(dt, time, x, y, z) {
    let hover = 3.0;
    let lift = if y < hover { (hover - y) * 120.0 } else { 0.0 };
    let wobble = 8.0 * (time * 2.5).sin();
    return [wobble, lift, 0.0];
}
