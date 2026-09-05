# pottery-wheel — tabletop throwing wheel (CAD project)

Hobby-scale **물레 방아** CAD model, built with the same cadgen / build123d workflow and **B0–B8 phase plan** proven in [`bench-pottery-wheel`](../bench-pottery-wheel/).

`bench-pottery-wheel` validated the **pipeline** (STEP → viewer, assembly mates, live reload).  
This project applies those patterns to a **product-intent** model: clearer datums, documented mates, and printable-friendly proportions.

---

## Design intent

| Item | Target |
|------|--------|
| Scale | Tabletop / studio hobby (not industrial) |
| Throwing surface | Ø300 mm disc, +Z up |
| Drive | NEMA-17 belt reduction → vertical spindle |
| Fluids | Removable splash pan + drain |
| Origin | Plinth center on XY; plinth top at **Z = 0** |
| Units | mm |

### Coordinate contract (do not break)

| Datum | Frame |
|-------|--------|
| Plinth top | Z = 0 |
| Plinth floor / shaft base | Z = −`PLINTH_H` |
| Belt plane | Z = −`PLINTH_H` + 38 (shared by both pulleys) |
| Wheel-head bottom | Z = 0 (bore receives shaft from below) |
| Motor mount foot | Plinth floor at `(0, motor_mount_y(), −PLINTH_H)` |

> Lessons from bench: **no redundant bearing coaxial** on the shaft (geometry already defines the journal).  
> Mate splash pan on **`pan_bottom`**, not pan origin. Prefer explicit `Pos` for wheel-head placement until revolute URDF (B5).

---

## Project layout (planned)

```
models/pottery-wheel/
  README.md                 ← this file
  .gitignore
  bench/                    ← per-phase notes + timing (optional)
  src/
    README.md               ← model catalog
    lib/
      __init__.py
      dims.py               ← B7 knobs + all shared constants
      drive_layout.py       ← pulley / belt / mate datums (single source of truth)
    wheel_head.py           ← B0 → B1
    splash_pan.py           ← B2
    plinth.py               ← B3, B8
    shaft.py                ← B3–B4
    motor_mount.py          ← B4
    drive_belt.py           ← B4
    assembly.py             ← root build
  STEP/                     ← generated (commit after each phase milestone)
  DXF/                      ← B6
  URDF/                     ← B5
```

---

## Phases (same IDs as bench, product deliverables)

| Phase | Build | Status |
|-------|--------|--------|
| **P0** | scaffold | ✅ |
| **B0** | `wheel_head` disc | ✅ |
| **B1** | `wheel_head` detail | ✅ |
| **B2** | `splash_pan` | ✅ |
| **B3** | `plinth`, `shaft`, `assembly` | ✅ |
| **B4** | `motor_mount`, `drive_belt` | ✅ |
| B5 | URDF | — |
| B6 | plinth DXF | — |
| **B7** | live reload bench | ✅ |
| B8 | plinth vents | — |

### Suggested build order

```
P0 → B0 → B1 → B2 → B3 → B4 → B7 → (verify in viewer) → B5 → B6 → B8
```

---

## Default dimensions (starting point)

Copied from bench baseline; tune under **B7 knobs** in `src/lib/dims.py`.

| Group | Key | Value (mm) |
|-------|-----|------------|
| Wheel | `WHEEL_D` | 300 |
| | `HEAD_THICKNESS` | 20 |
| Plinth | `PLINTH_D` | 320 (`WHEEL_D + 20`) |
| | `PLINTH_H` | 80 |
| Drive | `DRIVE_PULLEY_OD` / `MOTOR_PULLEY_OD` | 60 / 18 (~3.3:1) |
| Belt plane | offset from plinth floor | +38 |
| Splash pan | `PAN_DEPTH` | 22 |

Full list lives in code once P0 lands.

---

## Build commands

From repo root:

```bash
npm run agents:python:setup
npm run agents:python -- models/pottery-wheel/src/assembly.py
npm run agents:pottery-wheel:bench    # B7: rebuild + timing JSON
```

Live-reload loop: `bench/B7-live-reload.md`  
Preview: `models/pottery-wheel/STEP/assembly.step`

---

## Benchmark log

| Phase | build (s) | STEP KB | convert (s) | cache hit | viewer OK | notes |
|-------|-----------|---------|-------------|-----------|-----------|-------|
| B0 | | | | | | |
| B1 | | | | | | |
| B2 | | | | | | |
| B3 | | | | | | |
| B4 | | | | | | |
| B5 | | | | | | |
| B6 | | | | | | |
| B7 | | | | | | |
| B8 | | | | | | |

---

## Relationship to `bench-pottery-wheel`

| | bench-pottery-wheel | pottery-wheel (this) |
|--|---------------------|----------------------|
| Purpose | Pipeline / viewer stress test | Product-shaped assembly |
| Mates | Explored (some dead ends) | Documented datum contract above |
| Commits | Per-phase benchmarks | Per-phase **product** milestones |
| Reuse | — | Port proven `drive_layout` + mate patterns |

When porting from bench, copy **patterns** (`drive_layout`, foot datums, belt tangents), not files blindly.

---

## Out of scope (for now)

- FEA, motor thermal, exact GT2 belt tooth profile
- Purchased bearing / electronics STEP imports (future **B4+** `purchased/`)
- G-code / print profiles (see `$gcode` / `$dfam-check` later)

---

## Next step

**P0 + B0**: create `src/lib/dims.py`, `wheel_head.py` (plain disc), `STEP/`, `.gitignore`, and first green build.
