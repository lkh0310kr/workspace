# 닭장 시뮬레이션 (Chicken Coop)

PKMS 기획 [`🐔 닭장 시뮬레이션.md`](../../../../pkms/🐔%20닭장%20시뮬레이션.md)를 World Engine 프로젝트로 구현한 데모입니다.

## 기획 반영

| PKMS 요소 | 시뮬 구현 |
|-----------|-----------|
| 관리 구역 (사료·물) | 북서쪽 `feed_trough`, `water_trough` + 외부 호퍼 `feed_hopper` |
| 생활 구역 (둥지·횃대·비막이) | 남동 `nest_*`, 동쪽 `roost_*`, 중앙 `rain_shelter` |
| 품종 (산란 vs 견고) | `layer` / `hardy` — layer만 둥지에서 알 산란 |
| 자동급여(중력) | 호퍼 시각 + 트리거 급이 (향후 사료 잔량 연동) |
| 울타리·출입구 | `fence_*`, 남쪽 `gate` |

## 조작 (qt-shell)

| 키 | 동작 |
|----|------|
| F | 사료 보충 (농장 디렉터) |
| G | 물 보충 |
| 마우스 드래그 | 카메라 회전 |

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

## 확장 아이디어 (PKMS TODO)

- 품종별 스탯 JSON
- 야생동물(고양이·멧돼지) 이벤트
- 둥지 배치 최적화 점수 UI
- 사료 잔량 ↔ 급이 트리거 연동
