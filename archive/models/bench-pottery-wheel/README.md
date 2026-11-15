# bench-pottery-wheel — viewer + text-to-cad 벤치마크

Workspace의 **STEP → glb viewer**, **cadgen**, **live reload**를 검증하기 위해 단계별로 확장하는 단일 assembly입니다.

## Phases

| Phase | 모델 | 검증 항목 |
|-------|--------|----------------|
| **B0** ✅ | `wheel_head` — solid disc | STEP build, preview, cache hit |
| **B1** ✅ | `wheel_head` — rim, boss, bat pins, fillets | tessellation time, triangle count |
| **B2** ✅ | `splash_pan` — tray + drain compound | multi-solid STEP |
| **B3** ✅ | `assembly` — head + plinth + shaft | `AssemblyHelper`, joints |
| **B4** ✅ | `motor_mount` + `drive_belt` | belt drive, aligned pulleys |
| B5 | URDF (lazy susan) | cadgen viewer pane |
| B6 | `plinth` DXF | drawing track |
| **B7** ✅ | change `WHEEL_D` → rebuild | vibe-CAD `fs:changed` loop time |
| **B8** ✅ | plinth ventilation slots | viewer perf / mesh stress |

## Build (from repo root)

```bash
npm run agents:python:setup   # once
npm run agents:python -- models/bench-pottery-wheel/src/assembly.py
npm run agents:bench:pottery-wheel   # B7: rebuild + timing JSON
```

Workspace에서 `STEP/assembly.step`을 여세요. live-reload 반복 작업은 `bench/B7-live-reload.md`를 참고하세요.

## Benchmark log (fill each phase)

| Phase | 빌드 (초) | STEP KB | 변환 (초) | cache hit | viewer 정상 |
|-------|-----------|---------|-------------|-----------|-----------|
| B0 | | | | | |
