// 농장 디렉터 — 사료·물 보충(F/G), 낮/밤·비 상태는 닭 스크립트가 sim_time으로 판단.

let feed_stock = 1.0;
let water_stock = 1.0;
let eggs_today = 0;

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

    if feed_stock < 0.15 {
        set_time_scale(0.85);
    } else {
        set_time_scale(1.0);
    }
}
