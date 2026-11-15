# World Engine — 시뮬레이션 커널 계약

**상태:** Lab 트랙 기반 (2026-09-01)
**대상:** 향후 유지보수자 및 headless 테스트. 사용자 안내서가 아닙니다.

목표: 실제 시설(닭장, 물레방아, 농장)을 위한 개인 설계·운영 실험실입니다. Workspace와는 느슨하게 결합합니다.

---

## 계층 구성 (아래 → 위)

| 계층 | 역할 | 예시 |
|-------|------|----------|
| 0 오브젝트 | Transform와 선택적 physics/render/script/properties | Phase 34, 41 |
| 1 Step loop | 고정 tick, 순서, 결정성 | Phase 31–33 |
| 2 런타임 상태 | `sim_var`, metric, RNG stream | Phase 31–32 |
| 3 Snapshot | 직렬화 가능한 이어 실행 상태 | Phase 38 |
| 4 Query / clock | raycast, pause | Phase 35–36 |
| 5 데이터 편의 기능 | 설계 overlay | Phase 37 |
| 6 Harness | 시나리오 runner | Phase 39 |

Harness를 만들기 전에 **0→3**을 구현합니다.

---

## 한 번의 `step()` (불변 조건)

고정 dt: `step_dt() = fixed_dt() * time_scale()`. 호출할 때마다 다음 순서로 처리합니다.

1. Advance `sim_time` by `step_dt` (unless paused — Phase 36).
2. Build `WorldSnapshot` (named positions, rotations, tags, properties).
3. `entry_script` `on_world_update` → merge `sim_var` patch.
4. `Motion` kinematic targets (physics bodies only).
5. Entity Rhai `on_update` (physics **or** transform-only).
6. Rust `Behavior` (physics bodies only).
7. Rapier `physics_pipeline.step`.
8. Sync `Transform` from rigid bodies.
9. Collision script callbacks.
10. Projectiles, input `end_frame`.
11. Persist `rng_state` from script thread-local.

**JSON에 저장하지 않는 값:** `sim_var`, metric, RNG stream은 런타임 전용입니다.

---

## 오브젝트 모델 (Phase 41)

- Every spawned scene object has `Transform`.
- Physics: optional (`BodyType::None` → no `PhysicsBody`).
- Render: optional (`draw_list` skips entities without `RenderMesh`).
- Pick: `RenderScale` half-extents, else `PickBounds`, else default 0.5.
- `properties`: engine-opaque key/value; Rhai scope + `entity_property*`.

Scene data (`world-engine.json`) is not mutated at runtime. `properties` in save files are scene-authoring data, not checkpoint state (Phase 38).

---

## 결정성 (Phase 33)

`sim_seed`, `build_world`, `step_n`이 같으면 `sim_metrics`와 이름이 지정된 위치도 같습니다. 단, 다음 조건을 지켜야 합니다.

- Script load order unchanged (world script, then entities in file order).
- `build_world` syncs RNG after script init (`install_rng_state` → load → `set_rng_state`).

중단 없이 실행한 결과와 **복원 후 이어 실행한 결과**를 같게 하려면 checkpoint에서 `rng_state`(및 `sim_vars`)도 복원해야 합니다 (Phase 38).

---

## `WorldSave` — 시뮬레이션 이어 실행 (Phase 38)

| 필드 | 목적 |
|-------|---------|
| `sim_time` | 진행 중인 시뮬레이션 시계 |
| `time_scale` | Unity 방식의 시간 배율 |
| `entities[]` | 이름이 지정된 transform과 velocity |
| `sim_vars` | 공유 f64 저장소 |
| `rng_state` | Rhai `rand()` stream 위치 |
| `sim_seed` | 원래 seed (참고용이며 stream 상태는 `rng_state`) |

**저장하지 않는 값:** Rhai script local, `properties`, 이름이 붙은 엔티티에 연결되지 않은 ECS 구성 요소, `paused` flag (Phase 36; 아직 snapshot에 포함하지 않음).

왕복 동작에서 `snapshot` → `restore`는 `sim_time`, `sim_vars`, `rng_state`, 이름이 붙은 transform을 보존합니다. 복원 후 `step_n(k)`를 이어 실행하면 **`rng_state`** 기준으로 중단 없이 실행한 결과와 일치합니다. Rhai의 `let x = 0.0` 같은 script local은 복원하지 않습니다. 스크립트를 중간 상태에서 이어야 한다면 저장할 때 `sim_var` 또는 엔티티 transform을 사용하세요.

---

## 테스트

| 계약 | 파일 |
|----------|------|
| Kernel smoke | `tests/kernel_contract.rs` |
| Save + sim state | `tests/save_contract.rs` |
| Determinism | `tests/determinism_contract.rs` |
| Composition | `tests/composition_contract.rs` |

---

## 목표에 포함하지 않는 항목

멀티플레이어, PBR, 전체 편집기, Blender 수준 모델링, 상용 게임 출시, Workspace pane 임베딩, PKMS 결합, 엔진 스키마 안의 도메인 key는 목표에 포함하지 않습니다.

**MCU / 회로 / GPIO / Arduino:** World Engine 밖이며 별도 `hardware-sim/` 코드베이스의 책임입니다. World Engine 커널에 하드웨어 도메인 필드를 추가하지 않습니다.
