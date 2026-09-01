let sum = 0.0;

fn on_world_update(dt, time) {
    sum += rand_range(0.0, 1.0);
    set_sim_var("rng_sum", sum);
    publish_metric("rng_sum", sum);
}
