# World Engine — Rhai API v3

**Version constant:** `world_engine_core::script::RHAI_API_VERSION` = `"3"`  
**상태:** Phase 31–34, 41 (2026-09-01) — 시뮬레이션 및 설계 트랙

v2 함수는 유지됩니다. v4 전까지는 기존 기능을 깨뜨리지 않고 추가만 합니다.

---

## 엔티티 스크립트

```rhai
fn on_update(dt, time, x, y, z) {
    return [x, y, z];           // kinematic position
    return [x, y, z, rx, ry, rz]; // kinematic + euler rotation (radians, YXZ)
    return [fx, fy, fz];        // force or impulse per script_mode
}
```

선택 함수: `fn on_collision(other_name, started, x, y, z) { }`

## 월드 스크립트 (`entry_script`)

모듈 수준 `let` 상태는 프레임이 바뀌어도 **유지됩니다** (Godot autoload 패턴).

```rhai
let stock = 1.0;
fn on_world_update(dt, time) {
    stock -= dt * 0.01;
    set_sim_var("stock", stock);
    publish_metric("stock", stock);
}
```

---

## 내장 함수

### v2 (unchanged)

| 함수 | 설명 |
|----------|-------------|
| `entity_pos(name)` | `[x,y,z]` 위치 |
| `entity_rot(name)` | `[rx,ry,rz]` 오일러 라디안 회전 |
| `entity_x/y/z(name)` | 스칼라 위치 |
| `entity_with_tag(tag)` | 해당 tag가 붙은 첫 엔티티 이름 |
| `dist3(...)`, `lerp3(...)` | 수학 함수 |
| `yaw_from_delta(dx, dz)` | yaw를 구하는 atan2 함수 |
| `input_axis/pressed/down` | input map 조회 |
| `set_time_scale(s)` | `entry_script` 전용 |
| `set_camera_target(name)` | `entry_script` 전용 |
| `spawn_prefab(name, x, y, z)` | `entry_script` 전용 |
| `spawn_projectile(x,y,z,vx,vy,vz,lifetime)` | 엔티티 또는 entry 스크립트에서 사용 |

### v3 — shared simulation state (Phase 31)

| 함수 | 설명 |
|----------|-------------|
| `sim_var(name)` | 월드 저장소의 f64를 읽음 (없으면 `0.0`) |
| `set_sim_var(name, value)` | f64를 기록하며 다음 step부터 모든 스크립트에서 읽을 수 있음 |

Rust: `World::sim_var`, `World::set_sim_var`, `World::sim_vars()`.

`world-engine.json`에는 저장하지 않고 런타임에만 유지합니다.

### v3 — metrics export (Phase 32)

| 함수 | 설명 |
|----------|-------------|
| `publish_metric(name, value)` | `set_sim_var`와 같은 저장소를 사용하며 관찰 및 CI용으로 노출 |

Rust: `World::sim_metrics()` → `HashMap<String, f64>` snapshot after `step`.

shell은 metric을 읽고, 도메인별 key 이름은 엔진 스키마가 아니라 프로젝트 문서에 둡니다.

### v3 — deterministic RNG (Phase 33)

| 함수 | 설명 |
|----------|-------------|
| `rand()` | `[0, 1)` 범위의 균등 분포 f64 |
| `rand_range(lo, hi)` | `[lo, hi)` 범위의 균등 분포 f64 |

JSON: optional `sim_seed: u64` (default `1`). Rust: `World::sim_seed()`, `World::set_sim_seed(seed)` resets RNG state.

난수 추출 순서는 각 `step` 안의 스크립트 실행 순서(entry_script 먼저, 그다음 entity script)를 따릅니다. seed와 `step_n`이 같으면 metric과 움직임을 재현할 수 있습니다.

### v3 — entity properties (Phase 34)

| 함수 | 설명 |
|----------|-------------|
| `entity_property(name, key)` | 다른 엔티티의 `properties`에서 f64를 읽음 (없으면 `0.0`) |
| `entity_property_str(name, key)` | 문자열을 읽음 (없으면 `""`) |

JSON: `entities[].properties: { ... }` merged into the entity script scope at load (`script_args` overrides).

Rust: `World::set_properties`, `World::named_properties()`.

### v3 — composition (Phase 41)

장면 오브젝트는 physics를 생략(`body_type: "none"`)하거나 `components[]`를 선언할 수 있습니다. [world-engine-object-model.md](./world-engine-object-model.md)을 참고하세요.

---

## script_mode

| Value | `on_update` return |
|-------|-------------------|
| `kinematic` | position or position+rotation |
| `force` | force vector |
| `impulse` | impulse vector |

---

## v2 → v3 마이그레이션

호환성을 깨뜨리는 변경은 없습니다. 스크립트 간 상태 공유나 headless metric이 필요하면 프로젝트에서 `sim_var` / `publish_metric`을 사용할 수 있습니다. 시나리오를 동일하게 재생해야 한다면 `sim_seed`를 설정하세요.
