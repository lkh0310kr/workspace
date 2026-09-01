let wave = 0;
let timer = 0.0;

fn on_world_update(dt, time) {
    timer += dt;
    if timer >= 3.0 {
        timer = 0.0;
        wave += 1;
        let angle = wave as f64 * 0.8;
        let x = angle.sin() * 6.0;
        let z = angle.cos() * 6.0;
        spawn_prefab("drone", x, 0.5, z);
    }
}
