// 농장 디렉터 (entry_script) — 사료·물 재고를 sim_var로 노출.
// F/G: input_map refill_feed / refill_water

let feed_stock = 1.0;
let water_stock = 1.0;

fn on_world_update(dt, time) {
    feed_stock -= dt * 0.003;
    water_stock -= dt * 0.004;
    if feed_stock < 0.0 {
        feed_stock = 0.0;
    }
    if water_stock < 0.0 {
        water_stock = 0.0;
    }

    if input_pressed("refill_feed") {
        feed_stock = 1.0;
    }
    if input_pressed("refill_water") {
        water_stock = 1.0;
    }

    set_sim_var("feed_stock", feed_stock);
    set_sim_var("water_stock", water_stock);

    if feed_stock < 0.15 {
        set_time_scale(0.85);
    } else {
        set_time_scale(1.0);
    }
}
