let spawn_timer = 0.0;

fn on_world_update(dt, time) {
    spawn_timer += dt;
    if spawn_timer >= 2.0 {
        spawn_timer = 0.0;
        let angle = time * 0.5;
        let x = angle.sin() * 4.0;
        let z = angle.cos() * 4.0;
        spawn_prefab("enemy", x, 0.5, z);
    }
}
