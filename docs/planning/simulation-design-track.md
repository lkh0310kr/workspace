# 시뮬레이션·설계 트랙

시뮬레이션과 설계는 세 트랙으로 나눕니다. 각 트랙은 자체 커널을 유지합니다.

| 트랙 | 계획 문서 | 커널 |
|------|------|------|
| 월드·시설 물리 | [World Engine 단계 계획](./world-engine-phase-plan.md) **§10** (31단계 이후) | `world-engine-core` (Rapier, Rhai) |
| CAD·메시 뷰어 | [CAD 오케스트레이션 계획](./cad-orchestration-phase-plan.md) **50단계 이후** | Electron 오케스트레이터 + OCCT/FreeCAD 위임 |
| 회로·펌웨어 | [하드웨어 시뮬레이션 계획](./hardware-sim-phase-plan.md) **60단계 이후** | `hardware-sim-core` + avr8js 위임 |

PKMS와 닭장의 **공간 시나리오**는 `apps/workspace/test-fixtures/`와 World Engine의 `*_contract.rs`를 사용합니다.
닭장의 **Arduino 제어기**는 하드웨어 시뮬레이션 fixture에서 다룹니다.
