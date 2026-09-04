# World Engine — Phase Plan (Production Track)

**Status:** Active planning (2026-09-01)  
**목표:** 개인 **설계·운영 실험실** (닭장, 물레, 스마트팜 등)을 **엔진 포크 없이** 프로젝트 폴더만으로 반복 검증할 수 있는 수준  
**구현:** `world-engine/core/` · `world-engine/qt-shell/`  
**관련:** [world-engine-project.md](./world-engine-project.md) (프로젝트 레이아웃) · [09-future-native-architecture.md](../architecture/09-future-native-architecture.md) (Workspace 통합 이력)

---

## 1. North Star

| 기준 | 의미 |
|------|------|
| **코드 SDK 우선** | Rust `Behavior` + `World::spawn*`가 진실의 원천. JSON/Rhai는 그 위 레이어 |
| **프로젝트 격리** | 시뮬·설계 로직·에셋·씬은 프로젝트 폴더. Workspace/Electron·엔진 바이너리에 도메인 코드 없음 |
| **깨져도 크래시 안 함** | 잘못된 JSON·스크립트·메시 참조는 경고 + 스킵 (기존 Phase 1–9 패턴 유지) |
| **매 Phase마다 falsifiable** | headless 테스트 또는 fixture 1개 + 수동 QA 체크리스트 |
| **API 안정성** | Phase 13부터 `world-engine.json` 스키마·Rhai 내장 함수는 **additive only** (breaking은 major 버전) |
| **하위부터 단단히** | 커널 계약(0–3층) → 쿼리/클럭 → 오버레이/하네스. 시나리오 러너(39)는 마지막 |

**비목표 (이 트랙에서):** 상용 게임 출시, GDScript 수준 IDE, AAA 그래픽, 멀티플레이, Blender 대체, Workspace pane embed.

---

## 2. 아키텍처 레이어 (고정)

이 순서와 책임 분리는 Phase가 늘어도 **바꾸지 않는다**.

```
┌─────────────────────────────────────────────────────────────┐
│  Shell (world-engine-qt-shell / future embed)               │
│  창, 입력 포워딩, CLI, 프로젝트 경로                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ native handle, on_input
┌───────────────────────────▼─────────────────────────────────┐
│  Render (world-engine-core::render)                           │
│  wgpu, mesh upload, camera, draw_list                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ Transform, MeshKind
┌───────────────────────────▼─────────────────────────────────┐
│  Simulation (world-engine-core::world)                        │
│  ECS(hecs), rapier3d, step loop, Behavior SDK                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ spawn / attach_script / events
┌───────────────────────────▼─────────────────────────────────┐
│  Data (world-engine-core::scene + project/)                   │
│  world-engine.json, prefabs, Rhai, glTF assets                │
└─────────────────────────────────────────────────────────────┘
```

**시뮬 루프 순서 (고정):**

1. `entry_script` (`on_world_update`) — 월드 디렉터  
2. `Motion` (JSON sinusoidal)  
3. Entity Rhai (`on_update`) — `WorldSnapshot` 읽기  
4. Rust `Behavior`  
5. `rapier3d` physics step  
6. Transform 동기화 → render

---

## 3. 완료된 Phase (1–12) — 기준선

| Phase | 내용 | 검증 |
|-------|------|------|
| 1–4 | Qt shell, wgpu 직접 렌더, Electron spawn, TreeView | 수동 |
| 5–6 | `world-engine.json`, glTF mesh | fixtures |
| 7–9 | body types, shapes, joints, physics demo | fixtures |
| 10 | `world-engine-core` 라이브러리, `Behavior` SDK, `chase` example | `cargo run --example chase` |
| 11 | Rhai per-entity script, `script`/`script_args`, `gravity`, `name` | chase-demo |
| 12 | `entity_pos`, `entry_script`, `time_scale`, `script_mode: force`, 6+ sim fixtures | `cargo test --lib` |

상세 이력: [09-future-native-architecture.md § World Engine](../architecture/09-future-native-architecture.md)

---

## 4. Phase 진행 방식

각 Phase는 **한 PR / 한 대화 단위**로 닫는다.

### 체크리스트 (매 Phase 공통)

- [ ] `world-engine/core`: `cargo test --lib` 통과  
- [ ] `world-engine/qt-shell`: `cargo build` 통과  
- [ ] 기존 fixture 회귀 (entity count 동일, 크래시 없음)  
- [ ] 새 fixture 또는 example 1개 (해당 Phase 기능 증명)  
- [ ] `world-engine-phase-plan.md` 해당 Phase를 **DONE**으로 갱신  
- [ ] API 변경 시 `world-engine-project.md` 동기화  

### 우선순위 규칙

1. **시뮬 계약·입력·이벤트** → 게임 불가능 문제 먼저  
2. **스크립트 안정성** → 조용한 실패 제거  
3. **렌더·카메라** → 플레이 가능한 뷰  
4. **프리팹·씬·저장** → 제작 워크플로  
5. **레퍼런스 게임** → 통합 증명  

---

## 5. Production Track — Phase 13–25

### Phase 13 — Simulation Contract  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity FixedUpdate, Godot `_physics_process`, Bevy `FixedTimestep`  
**목표:** 시뮬레이션 의미를 문서·테스트로 고정해 이후 Phase가 깨지지 않게 한다.

| IN | OUT |
|----|-----|
| 고정 `dt` 계약 문서화 (`integration_parameters.dt`, `time_scale` 적용 규칙) | 멀티스레드 physics |
| `EntitySpec` / JSON `velocity: [vx,vy,vz]` 초기 속도 | 네트워크 동기화 |
| `World::step_n(n)` 헬퍼 (headless 결정론 테스트용) | 가변 timestep |
| 결정론 스모크 테스트 (동일 seed·동일 입력 → 동일 위치) | |

**산출물**

- `world.rs`: 초기 linear velocity  
- `scene.rs`: JSON `velocity` 필드  
- `tests/simulation_contract.rs` 또는 lib test  
- fixture: `world-engine-drop-demo` (초기 속도만으로 포물선)

**완료 기준**

- headless: 100 step 후 위치 오차 < ε (두 번 실행 동일)  
- qt-shell: drop-demo 시각 확인  

---

### Phase 14 — Input System  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity Input System (axis/action), Godot `Input`  
**목표:** shell 입력이 시뮬에 들어가고 Rhai/Rust에서 읽을 수 있다.

| IN | OUT |
|----|-----|
| `InputState` (키·마우스 버튼·스크롤, 프레임 스냅샷) | 게임패드 |
| qt-shell → `World::set_input` / `on_input` 연동 | 리바인딩 UI |
| Rhai: `input_axis("move_x")`, `input_pressed("jump")` | |
| JSON `input_map` (action → key) | |

**산출물**

- `input.rs` 모듈  
- fixture: `world-engine-fly-demo` (WASD + 마우스 룩)  

**완료 기준**

- 키 누르면 kinematic cube 이동 (스크립트만 수정, 엔진 재빌드 불필요)  

---

### Phase 15 — Collision Events  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Godot `body_entered` / `area_entered`, Unity `OnCollisionEnter`  
**목표:** 물리 충돌이 게임 로직으로 전달된다.

| IN | OUT |
|----|-----|
| step 후 collision pair 수집 (rapier `EventQueue` 또는 narrow phase) | 연속 collision CCD 튜닝 |
| `CollisionEvent { entity_a, entity_b, started }` 큐 | |
| Rhai: `on_collision(other_name, started)` (엔티티 스크립트, optional) | |
| 이름 없는 엔티티는 인덱스 문자열 fallback | |

**산출물**

- `events.rs`  
- fixture: `world-engine-trigger-demo` (골인 구역 감지)  

**완료 기준**

- headless: 두 sphere 접촉 시 `started=true` 이벤트 1회 이상  
- trigger-demo: 플레이어가 존 통과 시 색 변경 또는 로그  

---

### Phase 16 — Script Runtime Hardening  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Godot 에러 스택, Unity Console  
**목표:** 스크립트 실패가 **조용히 무시되지 않는다** (프로덕션 신뢰성).

| IN | OUT |
|----|-----|
| Rhai 런타임 에러 → `eprintln!` + `last_script_error` (World) | WASM 스크립트 |
| dev 모드: 스크립트 컴파일 실패 시 엔티티 스폰 스킵 (현행 유지) | |
| `Rhai API v1` 상수 + 내장 함수 목록 고정 문서 | |
| optional: `--watch` entry_script / entity script hot-reload (qt-shell) | |

**산출물**

- `script.rs` 에러 경로 정리  
- `docs/planning/world-engine-rhai-api.md` (v1 freeze)  

**완료 기준**

- 의도적 syntax error 시 로드 실패 메시지에 파일·줄 번호  
- 런타임 panic 대신 step 계속 (다른 엔티티 영향 없음)  

---

### Phase 17 — Entity Model v2  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity Transform, Godot Node3D  
**목표:** 위치만이 아닌 회전·속도 읽기/쓰기.

| IN | OUT |
|----|-----|
| Rhai: `entity_rot(name)`, `self` rotation in `on_update` | 스켈레탈 애니메이션 |
| `on_update` kinematic: optional `return [x,y,z, rx,ry,rz]` (하위 호환: 3원소 유지) | |
| `script_mode: impulse` — 일회성 `apply_impulse` | |
| `tags: ["player", "enemy"]` + `entity_with_tag("player")` (단일만) | |

**산출물**

- fixture: `world-engine-turret-demo` (yaw 추적)  

---

### Phase 18 — Rendering for Games  
**상태:** ✅ DONE (2026-09-01)  
**모방:** glTF PBR lite, Bevy `StandardMaterial`  
**목표:** 회색 박스 이상의 **구분 가능한** 비주얼.

| IN | OUT |
|----|-----|
| 엔티티별 `mesh` override (씬 공통 mesh와 병행) | 스킨ning |
| base_color (기존 `color`) + optional `texture` path | 멀티 라이트 |
| glTF baseColorTexture 1장 (optional) | 후처리 |
| ground grid / axis gizmo (dev, 토글) | |

**산출물**

- fixture: `world-engine-materials-demo`  

---

### Phase 19 — Camera System  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity Cinemachine (lite), Godot `Camera3D`  
**목표:** 플레이어 따라가는 카메라, 3인칭/탑다운 전환.

| IN | OUT |
|----|-----|
| JSON `camera: { mode, target, offset, fov }` | cinemachine 블렌드 트리 |
| modes: `orbit` (현행), `follow`, `fixed` | |
| Rhai: `set_camera_target("player")` (entry_script) | |

**산출물**

- fly-demo / chase-demo 카메라 개선  

---

### Phase 20 — Prefabs & Multi-Scene  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity Prefab, Godot PackedScene  
**목표:** 재사용 가능한 스폰 단위.

| IN | OUT |
|----|-----|
| `prefabs/player.prefab.json` (entities 서브트리) | 에디터 UI |
| `World::spawn_prefab` + Rhai `spawn_prefab("enemy", x,y,z)` | |
| `scenes/level1.json` + `world-engine.json`에서 `active_scene` | 비동기 로드 |
| 씬 전환 시 `on_scene_enter` entry hook | |

**산출물**

- fixture: `world-engine-spawner-demo`  

---

### Phase 21 — Save / Load  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity PlayerPrefs + scene serialize lite  
**목표:** 체크포인트·간단 세이브.

| IN | OUT |
|----|-----|
| `World::snapshot()` → JSON (entities, names, transforms, velocities) | 전체 에디터 역직렬화 |
| `World::restore(snapshot)` | |
| 프로젝트 `saves/` 파일 | 클라우드 세이브 |
| entry_script: `on_save` / `on_load` hooks | |

**산출물**

- fixture: `world-engine-checkpoint-demo`  

---

### Phase 22 — Physics Polish  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Rapier collision groups, Godot layers/masks  
**목표:** FPS·플랫포머에 필요한 충돌 필터.

| IN | OUT |
|----|-----|
| `collision_layer` / `collision_mask` (비트마스크) | soft body |
| sensor collider (`trigger: true`) — Phase 15 이벤트와 통합 | |
| character controller (kinematic + snap + slope limit) | full CC replica |
| friction, mass JSON 필드 | |

**산출물**

- fixture: `world-engine-platformer-physics-demo` (레이어 분리)  

---

### Phase 23 — Reference Game: Platformer  
**상태:** ✅ DONE (2026-09-01)  
**목표:** Phase 13–22 통합 증명 — **실제 미니 게임 1작**.

**게임 스펙 (초안)**

- 1 레벨, 3 체크포인트, 골 존  
- 이동·점프·적 1종·떨어지는 함정  
- 전부 `apps/workspace/test-fixtures/world-engine-game-platformer/` 한 폴더  

**완료 기준**

- 처음부터 골까지 플레이 가능 (qt-shell)  
- headless: 골 트리거 이벤트 assert  
- README에 조작·구조·확장법  

---

### Phase 24 — Reference Game: Top-Down Action  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 다른 장르로 API 범용성 증명.

- 탑다운 이동, 적 스폰 웨이브, projectile (kinematic + collision)  
- `world-engine-game-topdown/`  

---

### Phase 25 — Production Gate  
**상태:** ✅ DONE (2026-09-01)  
**목표:** “실제 게임 만들어도 된다” 선언 가능 수준.

| IN | OUT |
|----|-----|
| CI: `cargo test` + fixture manifest 스모크 | perf CI 게이트 |
| `world-engine.json` JSON Schema (`schemas/world-engine.schema.json`) | |
| semver: `world-engine-core` 0.x → 1.0 API freeze 후보 검토 | |
| 성능 예산 문서 (예: 500 dynamic bodies @ 60fps M1) | |
| embed vs qt-shell 결정 문서 갱신 | |

---

### Phase 26 — Debug Draw & Gizmos  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 레벨 제작 시 공간감 확보.

| IN | OUT |
|----|-----|
| `show_grid` / `show_axes` JSON 토글 | 에디터 gizmo UI |
| XZ 그리드 dev overlay (`render_frame_with_options`) | |

---

### Phase 27 — Projectile System  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 탑다운 슈터용 범용 투사체.

| IN | OUT |
|----|-----|
| `World::spawn_projectile` + Rhai `spawn_projectile(...)` | 풀링·오브젝트 풀 |
| lifetime 후 `despawn` | |

---

### Phase 28 — Wave Director Patterns  
**상태:** ✅ DONE (2026-09-01)  
**목표:** `entry_script`로 스폰 웨이브·난이도 곡선.

| IN | OUT |
|----|-----|
| `spawn_prefab` + 타이머 state | 비주얼 스크립트 에디터 |
| `world-engine-game-topdown` wave director | |

---

### Phase 29 — Headless Benchmarks  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 성능 회귀 조기 감지.

| IN | OUT |
|----|-----|
| `tests/benchmark_smoke.rs` (500 bodies × 60 steps) | CI perf gate |
| `docs/planning/world-engine-performance.md` | |

---

### Phase 30 — API 2.0 Freeze  
**상태:** ✅ DONE (2026-09-01)  
**목표:** Phase 17–29 추가 API를 v2로 고정.

| IN | OUT |
|----|-----|
| `RHAI_API_VERSION = "2"` | WASM 스크립트 |
| `world-engine-rhai-api.md` v2 갱신 | |
| `schemas/world-engine.schema.json` | |

---

## 6. Phase 의존성 그래프

```mermaid
flowchart LR
  P12[Phase 12 DONE]
  P13[13 Simulation]
  P14[14 Input]
  P15[15 Collisions]
  P16[16 Script hardening]
  P17[17 Entity v2]
  P18[18 Rendering]
  P19[19 Camera]
  P20[20 Prefabs]
  P21[21 Save]
  P22[22 Physics polish]
  P23[23 Platformer game]
  P24[24 Top-down game]
  P25[25 Production gate]

  P12 --> P13
  P13 --> P14
  P13 --> P15
  P14 --> P19
  P15 --> P22
  P14 --> P23
  P15 --> P23
  P16 --> P23
  P17 --> P23
  P19 --> P23
  P20 --> P23
  P21 --> P23
  P22 --> P23
  P18 --> P24
  P23 --> P24
  P24 --> P25
  P16 --> P17
  P17 --> P20
```

**병렬 가능:** 14+15, 18+19 (13 완료 후)

---

## 7. Fixture 인덱스 (현재 + 예정)

| Fixture | Phase | 용도 |
|---------|-------|------|
| `world-engine-demo` | 5 | 기본 3 큐브 |
| `world-engine-physics-demo` | 8 | body types |
| `world-engine-joints-demo` | 9 | revolute |
| `world-engine-mesh-demo` | 6 | glTF |
| `world-engine-chase-demo` | 12 | seek / entity_pos |
| `world-engine-orbit-demo` | 12 | 궤도 |
| `world-engine-patrol-demo` | 12 | waypoint |
| `world-engine-swarm-demo` | 12 | boids-lite |
| `world-engine-thruster-demo` | 12 | force mode |
| `world-engine-zero-g-demo` | 12 | 순수 물리 |
| `world-engine-slowmo-demo` | 12 | entry_script |
| `world-engine-drop-demo` | **13** | 초기 속도 |
| `world-engine-fly-demo` | **14** | 입력 |
| `world-engine-trigger-demo` | **15** | 충돌 이벤트 |
| `world-engine-turret-demo` | **17** | 회전 |
| `world-engine-materials-demo` | **18** | 머티리얼 |
| `world-engine-spawner-demo` | **20** | 프리팹 |
| `world-engine-checkpoint-demo` | **21** | 세이브 |
| `world-engine-platformer-physics-demo` | **22** | 레이어 |
| `world-engine-game-platformer` | **23** | 레퍼런스 플랫포머 |
| `world-engine-game-topdown` | **24** | 레퍼런스 탑다운 |

---

## 8. Workspace / Electron 경계 (변경 없음)

| 책임 | 소유 |
|------|------|
| 프로젝트 폴더 열기, spawn | `apps/workspace/src/main/worldEngine.ts` |
| TreeView "Open in World Engine" | renderer |
| 시뮬·렌더·물리 | `world-engine-core` |
| 창·입력 | `world-engine-qt-shell` |

Phase 13+에서 Electron 변경은 **입력 IPC·메트릭 표시** 정도만. 게임 로직은 절대 `apps/workspace/`에 넣지 않음.

---

## 9. 다음 액션

**Phase 1–30 완료.** 다음은 **§10 Simulation & Design Track (Phase 31+)** — 월드 엔진 코어·qt-shell만. 네트워크·PBR·게임 레퍼런스 확장은 하지 않음.

**착수 (하위→상위):** World Engine 커널 Phase 35–38 ✅ 완료.

**다음 트랙:** [cad-orchestration-phase-plan.md](./cad-orchestration-phase-plan.md) **Phase 50+** — Workspace 중앙 오케스트레이션 (OCCT/FreeCAD delegate, glTF hub, WE 뷰어·시뮬).
전기·펌웨어는 별 트랙: [hardware-sim-phase-plan.md](./hardware-sim-phase-plan.md) **Phase 60+** (WE에 합치지 않음).

구 Phase 37/39/40은 오케스트레이션 트랙으로 재배치·보류 (37→58, 40→59, 39 보류).

커널 계약: [world-engine-simulation.md](./world-engine-simulation.md) · `tests/kernel_contract.rs`

macOS `cargo test` doctest SIGKILL: `world-engine/core/scripts/fix-rust-quarantine.sh` 실행.

---

## 10. Phase 31+ — Simulation & Design Track (World Engine)

**목표:** 설계·시뮬레이션 프로젝트(PKMS, 공장/농장 모델)를 **엔진 API만으로** headless 검증 가능하게.  
**범위:** `world-engine/core/`, `world-engine/qt-shell/`, `schemas/`, `tests/*_contract.rs`  
**비범위:** 멀티플레이·네트워크, PBR/스키닝, 미니게임 장르 확장, Electron 도메인 로직, Blender/모델링 파이프라인

**설계 vs 시뮬 (엔진 관점)**

| 층 | 엔진이 제공 | 프로젝트가 소유 |
|----|-------------|-----------------|
| **Design (In)** | JSON 로드, `properties`, design overlay merge | `design/*.json`, 배치·스펙 수치 |
| **Simulation (Out)** | `step`/`step_n`, `sim_var`, metrics, save | Rhai 정책, PKMS 규칙 |
| **Observation** | pick, fly cam, metrics export | qt-shell/Electron 표시 문구 |

**엔진 API 원칙:** 도메인 필드(`label`, `feed_stock` JSON 키) 금지. `name`, `tags`, `properties`, `sim_var` 같은 **범용 슬롯**만.

**실행 우선순위 (2026-09-01, bottom-up)**

```
0. 커널 계약 문서 + kernel_contract.rs          ✅
1. Phase 38 — WorldSave                         ✅
2. Phase 36 — pause / clock                     ✅
3. Phase 35 — physics raycast                   ✅
─── 다음: CAD Orchestration Phase 50+ ───
4. Phase 50–59 — [cad-orchestration-phase-plan.md](./cad-orchestration-phase-plan.md)
(구 37/39/40 → 58/보류/59 로 이동)
```

---

### Phase 31 — Shared simulation state  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity static / Godot Autoload 변수, LabVIEW shared data  
**목표:** 월드 스크립트 ↔ 엔티티 스크립트가 **같은 런타임 상태**를 읽고 쓴다.

| IN | OUT |
|----|-----|
| `sim_var` / `set_sim_var` (Rhai + `World::sim_var`) | DB, SQL |
| `WorldScript` scope 프레임 간 유지 (autoload 상태) | |
| `RHAI_API_VERSION = "3"` + [world-engine-rhai-api.md](./world-engine-rhai-api.md) | |
| mesh `RenderScale` = collider 크기 (시뮬 공간 = 렌더 공간) | |

**산출물:** `chicken_coop_contract` (feed_stock deplete), 기존 fixture 회귀 없음.

**완료 기준:** v3 API 문서 freeze, schema에 `sim_var` 동작 설명(비필드).

---

### Phase 32 — Metrics snapshot  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Unity Profiler custom markers, Grafana export lite  
**목표:** headless·쉘이 **런타임 결과**를 읽기 (도메인 문자열은 프로젝트).

| IN | OUT |
|----|-----|
| `World::sim_metrics() -> HashMap<String, f64>` (`sim_var` 스냅샷 또는 allowlist) | 인게임 HUD 프레임워크 |
| Rhai `publish_metric(name, value)` → 동일 저장소 | |
| qt-shell: metrics JSON 한 줄 stdout (옵션) | Electron 차트 UI |

**산출물:** `tests/metrics_contract.rs`, demo entry_script가 2–3개 키 publish.

**완료 기준:** step 후 Rust에서 `world.sim_metrics()["feed_stock"]` assert.

---

### Phase 33 — Determinism & scenario seed  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 같은 `world-engine.json` + seed → 같은 `step_n` 결과 (설계 A/B 비교 전제).

| IN | OUT |
|----|-----|
| JSON `sim_seed: u64` | 분산 시뮬 |
| Rhai `rand()` / `rand_range(a,b)` — seed from world | |
| `World::step_n` 후 positions 해시 또는 golden file | |

**산출물:** `tests/determinism_contract.rs`

---

### Phase 34 — Entity `properties` (design metadata)  
**상태:** ✅ DONE (2026-09-01)  
**모방:** Godot metadata, Unity `[SerializeField]` on component  
**목표:** 도메인 스펙을 **엔티티에 붙이되** 엔진은 key-value만 안다.

| IN | OUT |
|----|-----|
| `entities[].properties: { ... }` → Rhai `on_update` scope 상수 | `label` 같은 단일 필드 |
| `entity_property(name, key)` 읽기 (스냅샷) | |
| schema + contract | |

**산출물:** `world-engine-properties-demo`, `tests/properties_contract.rs`

---

### Phase 41 — Scene object composition (SDK / JSON alignment)  
**상태:** ✅ DONE (2026-09-01)  
**목표:** ECS 조합 모델을 Rust SDK·JSON·Rhai에 동형으로 노출.

| IN | OUT |
|----|-----|
| `spawn_empty` + `attach_*` / `spawn_from_blueprint` | parent/child hierarchy |
| `body_type: "none"`, `pick_half_extents` | |
| `entities[].components[]` explicit format | flat JSON sugar 유지 |
| `World::draw_list` skips entities without `RenderMesh` | |

**산출물:** [world-engine-object-model.md](./world-engine-object-model.md), `world-engine-composition-demo`, `tests/composition_contract.rs`

---

### Phase 35 — Physics raycast pick  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 설계 검토용 정확한 hit (형상·회전 반영).

| IN | OUT |
|----|-----|
| `World::raycast(origin, dir) -> Option<RayHit { name, distance, point }>` | GPU picking |
| qt-shell: `pick_entity_at_screen_physics` (AABB fallback for markers) | |

**산출물:** `pick_contract.rs` (AABB vs physics occlusion).

---

### Phase 36 — Simulation clock control  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 설계 리뷰·단계별 관찰.

| IN | OUT |
|----|-----|
| `World::set_paused(bool)` — physics/script skip | 타임라인 에디터 |
| `step_n`은 유지; `sim_time` pause 중 정지 | |
| JSON `time_scale` + Rhai 기존 API | |

**산출물:** `pause_contract.rs`

---

### Phase 37 — Design file overlay  
**상태:** ⏸ DEFERRED → [cad-orchestration Phase 58](./cad-orchestration-phase-plan.md#phase-58--design-file-overlay)  
**목표:** `world-engine.json`(geometry) + `design/*.json`(스펙) 분리 로드.

| IN | OUT |
|----|-----|
| JSON `design: "design/coop.json"` — merge into load or Rhai init | 비주얼 design tool |
| Rhai `design_get(path)` 또는 scope preload | |
| 깨진 경로 → warn + skip | |

**산출물:** chicken-coop-demo `design/` 분리, contract 동일.

---

### Phase 38 — Save includes simulation state  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 체크포인트에 **sim_var·RNG 스트림·시뮬 시계** 포함.

| IN | OUT |
|----|-----|
| `WorldSave`에 `sim_vars`, `rng_state`, `sim_seed` | 전체 Rhai scope serialize |
| `restore` round-trip + RNG continuation test | Rhai script locals rehydrate |

**산출물:** `save_contract` 확장, [world-engine-simulation.md](./world-engine-simulation.md) §WorldSave.

---

### Phase 39 — Headless scenario runner  
**상태:** ⏸ DEFERRED (CAD MVP 후 재검토)  
**목표:** CI에서 **여러 프로젝트 디렉터리**를 동일 harness로 `step_n` + metrics 비교.

| IN | OUT |
|----|-----|
| `tests/scenario_runner.rs` + manifest `scenarios.toml` | GUI batch runner |
| 실패 시 diff metrics | |

**산출물:** 닭장 A/B layout 디렉터리 2개 비교 (엔진 harness만; 규칙은 프로젝트).

---

### Phase 40 — Sim/Design API 1.0 freeze  
**상태:** ⏸ DEFERRED → [cad-orchestration Phase 59](./cad-orchestration-phase-plan.md#phase-59--orchestration-api-10-freeze)  
**목표:** Phase 31–39를 **시뮬 전용** semver 1.0 후보로 고정.

| IN | OUT |
|----|-----|
| `world-engine.schema.json` 갱신 | WASM |
| `world-engine-rhai-api.md` v3 freeze | |
| `docs/planning/world-engine-simulation.md` (설계자용 1페이지) | |

---

### Phase 31+ 우선순위 (엔진 작업만)

```
31 (sim_var 문서화) → 32 metrics → 33 seed/결정론
  → 34 properties → 41 composition → 35 raycast → 36 pause
  → 37 design overlay → 38 save+sim_vars → 39 scenario runner → 40 freeze
```

**의도적 제외:** Phase 18 PBR 확장, 멀티플레이, Phase 23–24식 게임 레퍼런스 추가, 3D 뷰어/모델링 트랙.

**프로젝트(PKMS 닭장) 작업**은 엔진 Phase와 분리 — fixture·Rhai·contract만, 위 API가 열릴 때마다 소비.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-09-03 | Hardware sim Phase 60+ — WE 비합류, [hardware-sim-phase-plan.md](./hardware-sim-phase-plan.md) |
| 2026-09-01 | CAD Orchestration Phase 50+ — [cad-orchestration-phase-plan.md](./cad-orchestration-phase-plan.md) |
| 2026-09-01 | Phase 35–36 DONE; Phase 37/39/40 deferred to orchestration track |
| 2026-09-01 | Phase 33 DONE: sim_seed, determinism_contract |
| 2026-09-01 | §10 Phase 31+ Simulation & Design Track (World Engine) |
| 2026-09-01 | Phase 17–30 DONE: entity v2, camera, prefabs, save, layers, games, schema, benchmarks |
| 2026-09-01 | Phase 16 DONE: script errors, RHAI_API_VERSION, world-engine-rhai-api.md |
| 2026-09-01 | Phase 15 DONE: collision events, on_collision, trigger-demo, KINEMATIC_FIXED |
| 2026-09-01 | Phase 14 DONE: input_map, fly-demo, qt keyboard, input_contract tests |
| 2026-09-01 | Phase 13 DONE: velocity, step_n, simulation_contract tests, drop-demo |
| 2026-09-01 | 초안: Phase 1–12 기준선 + Production Track 13–25 |
