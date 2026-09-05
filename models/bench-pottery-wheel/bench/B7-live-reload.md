# B7 — live reload iteration loop

Validates **param edit → cadgen rebuild → `fs:changed` → STEP→glb → viewer soft reload**.

## Setup (once)

1. `npm run agents:python:setup`
2. Start Workspace with this repo as the tab root (`apps/workspace && npm run dev`)
3. Open `models/bench-pottery-wheel/STEP/assembly.step` in the Model Viewer pane

## Loop

1. Edit knobs in `src/lib/dims.py` (section **B7 live-iteration knobs**), e.g.:

   ```python
   WHEEL_D = 310.0
   PLINTH_D = 330.0   # keep ~20 mm over wheel OD
   ```

2. Rebuild from repo root:

   ```bash
   npm run agents:bench:pottery-wheel
   ```

3. The terminal prints JSON timing (`build_ms`, `validate_ms`, `step_kb`).
4. Workspace should soft-reload the preview when `assembly.step` is rewritten (no tab close).

## What to measure

| Leg | How |
|-----|-----|
| **cadgen build** | `build_ms` from bench script |
| **STEP validate** | `validate_ms` from bench script |
| **STEP→glb convert** | DevTools / `logs/model3d.ndjson` after reload (`preview_fs_changed` → convert) |
| **Viewer TTI** | Time until mesh visibly updates after rebuild |
| **Cache** | Second open without rebuild should be fast; after rebuild, convert runs again (new mtime) |

## Troubleshooting

- No reload: confirm the open file path matches `STEP/assembly.step` under the tab root.
- Stale mesh: check `model3d.ndjson` for `preview_fs_changed` and a new `revision`.
- Build no-op: cadgen skips unchanged models — tweak `dims.py` or delete `STEP/assembly.step` once.

## Log template

Copy into the project `README.md` benchmark table:

| run | WHEEL_D | build_ms | convert_ms | viewer OK | notes |
|-----|---------|----------|------------|-----------|-------|
| 1 | 300 | | | | baseline |
| 2 | 310 | | | | B7 iteration |
