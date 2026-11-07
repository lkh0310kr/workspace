// Godot autoload / Unity Time.timeScale — pulse simulation speed.
fn on_world_update(dt, time) {
    let scale = 0.35 + 0.65 * (0.5 + 0.5 * (time * 1.2).sin());
    set_time_scale(scale);
}
