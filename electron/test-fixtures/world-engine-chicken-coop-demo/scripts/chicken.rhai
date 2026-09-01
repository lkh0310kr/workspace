// 닭 AI — PKMS 기획: 관리 구역(사료·물) / 생활 구역(둥지·횃대·비막이) 분리.
// breed: "layer" (산란) | "hardy" (질병 저항, 산란 안 함)

let hunger = 0.55;
let thirst = 0.5;
let lay_cooldown = 0.0;
let wander_angle = 0.0;

fn day_phase(time) {
    let day_len = 90.0;
    return (time % day_len) / day_len;
}

fn is_night(time) {
    return day_phase(time) > 0.68;
}

fn is_raining(time) {
    return (time * 0.11).sin() > 0.82;
}

fn move_toward(x, y, z, tx, ty, tz, dt, step_speed) {
    let dx = tx - x;
    let dy = ty - y;
    let dz = tz - z;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    if dist < 0.12 {
        return [x, y, z];
    }
    let step = step_speed * dt;
    let scale = if step >= dist { 1.0 } else { step / dist };
    return [x + dx * scale, y + dy * scale, z + dz * scale];
}

fn clamp_coop(x, y, z) {
    let nx = if x < -8.5 { -8.5 } else { if x > 8.5 { 8.5 } else { x } };
    let nz = if z < -6.5 { -6.5 } else { if z > 6.5 { 6.5 } else { z } };
    let ny = if y < 0.35 { 0.35 } else { y };
    return [nx, ny, nz];
}

fn on_update(dt, time, x, y, z) {
    hunger += dt * 0.018;
    thirst += dt * 0.022;
    if lay_cooldown > 0.0 {
        lay_cooldown -= dt;
    }

    let feed = entity_pos("feed_trough");
    let water = entity_pos("water_trough");
    let nest = entity_pos("nest_0");
    let roost = entity_pos("roost_0");
    let shelter = entity_pos("rain_shelter");

    if feed.len() >= 3 {
        let dfx = x - feed[0];
        let dfz = z - feed[2];
        if (dfx * dfx + dfz * dfz).sqrt() < 1.4 {
            hunger = if hunger - dt * 0.7 < 0.0 { 0.0 } else { hunger - dt * 0.7 };
        }
    }
    if water.len() >= 3 {
        let dwx = x - water[0];
        let dwz = z - water[2];
        if (dwx * dwx + dwz * dwz).sqrt() < 1.2 {
            thirst = if thirst - dt * 0.8 < 0.0 { 0.0 } else { thirst - dt * 0.8 };
        }
    }

    let target = [x, y, z];
    let move_speed = speed;

    if is_raining(time) {
        if shelter.len() >= 3 {
            target = move_toward(x, y, z, shelter[0], shelter[1] - 0.5, shelter[2], dt, move_speed);
        }
    } else if is_night(time) {
        if roost.len() >= 3 {
            target = move_toward(x, y, z, roost[0], roost[1] + 0.15, roost[2], dt, move_speed * 0.9);
        }
    } else if thirst > 0.55 {
        if water.len() >= 3 {
            target = move_toward(x, y, z, water[0], water[1], water[2], dt, move_speed);
        }
    } else if hunger > 0.45 {
        if feed.len() >= 3 {
            target = move_toward(x, y, z, feed[0], feed[1], feed[2], dt, move_speed);
        }
    } else if breed == "layer" && hunger < 0.35 && thirst < 0.4 && lay_cooldown <= 0.0 {
        if nest.len() >= 3 {
            target = move_toward(x, y, z, nest[0], nest[1], nest[2], dt, move_speed * 0.85);
        }
    } else {
        wander_angle += dt * 0.7;
        let wx = x + wander_angle.cos() * speed * dt * 0.2;
        let wz = z + wander_angle.sin() * speed * dt * 0.2;
        target = [wx, y, wz];
    }

    let c = clamp_coop(target[0], target[1], target[2]);
    return [c[0], c[1], c[2]];
}

fn on_collision(other, started, x, y, z) {
    if !started {
        return;
    }
    if breed != "layer" {
        return;
    }
    if other != "nest_0" && other != "nest_1" {
        return;
    }
    if lay_cooldown > 0.0 || hunger > 0.4 || thirst > 0.45 {
        return;
    }
    lay_cooldown = 25.0;
    spawn_prefab("egg", x, y - 0.15, z);
}
