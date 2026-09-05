# B7 — live reload iteration loop

Validates **param edit → cadgen rebuild → `fs:changed` → STEP→glb → viewer soft reload**.

## Setup (once)

1. `npm run agents:python:setup`
2. Start Workspace with this repo as the tab root (`cd apps/workspace && npm run dev`)
3. Open `models/pottery-wheel/STEP/assembly.step` in the Model Viewer pane

## Loop

1. Edit knobs in `src/lib/dims.py`:

   ```python
   WHEEL_D = 310.0
   PLINTH_D = 330.0   # keep ~20 mm over wheel OD
   ```

2. Rebuild:

   ```bash
   npm run agents:pottery-wheel:bench
   ```

3. Workspace should soft-reload when `assembly.step` is rewritten.

## Troubleshooting

- No reload: confirm the open path is `models/pottery-wheel/STEP/assembly.step`.
- Stale mesh: check `logs/model3d.ndjson` for `preview_fs_changed`.
- Build no-op: tweak `dims.py` or delete `STEP/assembly.step` once.
