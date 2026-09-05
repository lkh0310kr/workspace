# bench-pottery-wheel — viewer + text-to-cad benchmark

Single assembly grown step-by-step to validate Workspace **STEP → glb viewer**, **cadgen**, and **live reload**.

## Phases

| Phase | Model | What it tests |
|-------|--------|----------------|
| **B0** ✅ | `wheel_head` — solid disc | STEP build, preview, cache hit |
| **B1** ✅ | `wheel_head` — rim, boss, bat pins, fillets | tessellation time, triangle count |
| B2 | `splash_pan` + compound | multi-solid STEP |
| **B3** ✅ | `assembly` — head + plinth + shaft | `AssemblyHelper`, joints |
| B4 | `motor_mount` | sub-assembly / hardware |
| B5 | URDF (lazy susan) | cadgen viewer pane |
| B6 | `plinth` DXF | drawing track |
| B7 | change `WHEEL_D` → rebuild | vibe-CAD `fs:changed` loop time |
| B8 | ribbed / perforated variant | viewer perf ceiling |

## Build (from repo root)

```bash
npm run agents:python:setup   # once
npm run agents:python -- models/bench-pottery-wheel/src/wheel_head.py
npm run agents:python -- models/bench-pottery-wheel/src/assembly.py
```

Open `STEP/assembly.step` (or `STEP/wheel_head.step`) in Workspace.

## Benchmark log (fill each phase)

| Phase | build (s) | STEP KB | convert (s) | cache hit | viewer OK |
|-------|-----------|---------|-------------|-----------|-----------|
| B0 | | | | | |
