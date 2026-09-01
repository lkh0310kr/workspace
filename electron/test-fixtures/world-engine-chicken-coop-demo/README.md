# 닭장 시뮬레이션 (Chicken Coop)

PKMS 기획 [`🐔 닭장 시뮬레이션.md`](../../../../pkms/🐔%20닭장%20시뮬레이션.md)를 World Engine 프로젝트로 구현한 데모입니다.

## 기획 반영

| PKMS 요소 | 시뮬 구현 |
|-----------|-----------|
| 관리 구역 (사료·물) | 북서쪽 `feed_trough`, `water_trough` + 울타리 **바깥** `feed_hopper` + `feed_chute` |
| 생활 구역 (둥지·횃대·비막이) | 남동 `nest_*`, 동쪽 `roost_*`, 중앙 `rain_shelter` |
| 품종 (산란 vs 견고) | `layer` / `hardy` — layer만 둥지에서 알 산란 |
| 사람 보충 / 재고 | `farm_director.rhai` → `sim_var("feed_stock")` / `water_stock` |
| 울타리·장벽·출입 | `fence_*`, `barrier_*`, 남쪽 `gate` |

## 구역 레이아웃

```
                    N
         ┌─────────────────────────────┐
         │  zone_mgmt — 사료·물         │
         │  hopper(外) → chute → trough │
         │         rain_shelter        │
         │              zone_living    │
         └────────── zone_gate ────────┘
                    S (출입)
```

## 조작 (qt-shell)

| 키 / 입력 | 동작 |
|-----------|------|
| WASD | 카메라 이동 (`camera.mode: fly`) |
| Space / Ctrl | 상승 / 하강 |
| 마우스 드래그 | 시선 회전 |
| 휠 | 전후 이동 |
| F / G | 사료·물 보충 (`input_map`) |

qt-shell은 `pick_entity_at_screen`으로 엔티티 **`name`** 을 창 제목에 표시합니다.

## 실행

```bash
cd native/world-engine-qt-shell
cargo run -- ../../electron/test-fixtures/world-engine-chicken-coop-demo
```

## Headless 검증

```bash
cd native/world-engine-core
cargo test --test chicken_coop_contract
```

## 엔진 API (이 데모가 쓰는 것)

| API | 용도 |
|-----|------|
| `sim_var` / `set_sim_var` | 월드·엔티티 스크립트 간 공유 상태 |
| `entity_pos` | 시설 위치 조회 |
| `spawn_prefab` | 알 산란 |
| `input_pressed` | F/G 보충 |

## PKMS 백로그

- 품종별 스탯 JSON
- 야생동물(고양이·멧돼지) 이벤트
- 둥지 배치 최적화 점수
