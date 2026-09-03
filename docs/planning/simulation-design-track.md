# Simulation & Design Track

트랙이 셋이다. 커널을 한데 섞지 않는다.

| 트랙 | 문서 | 커널 |
|------|------|------|
| 월드·시설 물리 | [world-engine-phase-plan.md](./world-engine-phase-plan.md) **§10** (Phase 31+) | `world-engine-core` (Rapier, Rhai) |
| CAD · 메시 뷰어 | [cad-orchestration-phase-plan.md](./cad-orchestration-phase-plan.md) **Phase 50+** | Electron orchestrator + OCCT/FreeCAD delegate |
| 회로 · 펌웨어 | [hardware-sim-phase-plan.md](./hardware-sim-phase-plan.md) **Phase 60+** | `hardware-sim-core` (예정) + avr8js delegate |

PKMS/닭장 **공간** 시나리오는 `electron/test-fixtures/` + WE `*_contract.rs`.
닭장 **컨트롤러(Arduino)** 는 hardware-sim fixture (Phase 60+).
