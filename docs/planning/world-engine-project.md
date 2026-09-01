# World Engine — project layout

**Status:** v2 (2026-09-01)  
**구현:** `native/world-engine-core/`  
**상위:** [09-future-native-architecture.md](../architecture/09-future-native-architecture.md) Phase 10–12  
**로드맵:** [world-engine-phase-plan.md](./world-engine-phase-plan.md) — **Production Track (Phase 13+)**  

---

## 원칙

- **프로젝트 폴더 = 격리 단위** (Godot `project.godot` + `.gd`, Unity `Assets/`)
- Workspace Electron은 spawn·TreeView·IPC만 담당
- 도메인 시뮬은 **엔진 기능이 아니라 프로젝트 예제**로 추가

```
my-sim/
  world-engine.json     # 씬 + entry_script
  scripts/              # 이 프로젝트 전용 Rhai
    logic.rhai
  assets/               # (선택) glTF
```

---

## `world-engine.json`

| 필드 | 설명 | 모방 |
|------|------|------|
| `gravity` | `[x,y,z]` m/s² | PhysX / Rapier |
| `time_scale` | 시뮬 배속 (기본 `1.0`) | Unity `Time.timeScale` |
| `entry_script` | 월드 Rhai (`on_world_update`) | Godot Autoload |
| `input_map` | action → key / axis (Phase 14) | Unity Input System |
| `entities[]` | 엔티티 | — |
| `joints[]` | 조인트 | — |
| `mesh` | 공통 glTF | — |

### 엔티티

| 필드 | 설명 |
|------|------|
| `name` | `entity_pos("name")` 조회용 |
| `script` | `.rhai` 경로 |
| `script_args` | scope 상수 (숫자·문자열·배열) |
| `script_mode` | `"kinematic"` (위치 반환) 또는 `"force"` (힘 반환) |
| `velocity` | `[vx,vy,vz]` m/s 초기 선속도 (dynamic, Phase 13) |

---

## Simulation Contract (Phase 13)

| API / 필드 | 의미 |
|------------|------|
| `World::fixed_dt()` | Rapier 기본 step (≈ 1/60 s) |
| `World::time_scale()` | Unity `Time.timeScale` 배율 |
| `World::step_dt()` | `fixed_dt * time_scale` |
| `World::sim_time()` | 누적 시뮬 시각 |
| `World::step_n(n)` | headless 결정론 테스트 |
| `velocity` | 스폰 시 선속도 |
| `World::sim_var` / `set_sim_var` | **Phase 31** 런타임 공유 f64 상태 |
| `World::sim_metrics()` | **Phase 32** `sim_var` 스냅샷 (CI·쉘) |
| `sim_seed` / `rand()` | **Phase 33** 결정론 RNG (Rhai + JSON) |

테스트: `cargo test --test simulation_contract` · `cargo test --test metrics_contract`

---

## Rhai API (v3)

See [world-engine-rhai-api.md](./world-engine-rhai-api.md). v3 adds `sim_var`, `set_sim_var`, `publish_metric`, `rand` / `rand_range`.

### 엔티티 스크립트 — `on_update(dt, time, x, y, z) -> [a,b,c]`

| 반환 | `script_mode` | 동작 |
|------|---------------|------|
| `[x,y,z]` | `kinematic` | kinematic 목표 위치 |
| `[fx,fy,fz]` | `force` | dynamic body에 힘 |

**내장 함수**

| 함수 | 설명 |
|------|------|
| `entity_pos(name)` | `[x,y,z]` — Godot `get_node` / Unity `Find` |
| `entity_x/y/z(name)` | 스칼라 |
| `dist3(...)` | 거리 |
| `lerp3(...)` | 선형 보간 |

**상태:** `global` 변수 + 재사용 scope — Godot 인스턴스 변수 / Unity MonoBehaviour 필드

### 월드 스크립트 — `on_world_update(dt, time)`

| 함수 | 설명 |
|------|------|
| `set_time_scale(s)` | Unity `Time.timeScale` |
| `sim_var` / `set_sim_var` | 월드↔엔티티 공유 상태 (Phase 31) |
| `publish_metric` | headless/쉘 관측용 스칼라 (Phase 32) |

### 입력 (Phase 14)

| 함수 | 설명 |
|------|------|
| `input_axis("move_x")` | `-1..1` (JSON axis binding) |
| `input_pressed("jump")` | 이번 step에 눌림 |
| `input_down("jump")` | 누르고 있음 |

`input_map` 예:

```json
"input_map": {
  "move_x": { "negative": "A", "positive": "D" },
  "jump": "Space"
}
```

---

## 예제 프로젝트

| 경로 | 패턴 |
|------|------|
| `world-engine-chase-demo` | Seek — `entity_pos("target")` |
| `world-engine-orbit-demo` | 궤도 운동 |
| `world-engine-patrol-demo` | Waypoint patrol + `global` state |
| `world-engine-swarm-demo` | Boids-lite swarm |
| `world-engine-thruster-demo` | `script_mode: force` hover |
| `world-engine-zero-g-demo` | 순수 물리 (스크립트 없음) |
| `world-engine-slowmo-demo` | `entry_script` + time pulse |
| `world-engine-drop-demo` | **Phase 13** 초기 `velocity` + 포물선 |
| `world-engine-fly-demo` | **Phase 14** WASD `input_map` |
| `world-engine-physics-demo` | body types |
| `world-engine-joints-demo` | revolute joint |

Headless 테스트: `cd native/world-engine-core && cargo test --lib`

---

## 다음 (미구현)

→ **[world-engine-phase-plan.md](./world-engine-phase-plan.md)** — **Phase 15** 충돌 이벤트 NEXT
- Phase 15: 충돌 이벤트
- … Phase 25: Production gate

새 시뮬 = **새 fixture 폴더** — 엔진 코어에 도메인 코드 넣지 않음.
