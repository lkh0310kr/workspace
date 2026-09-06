# Assembly bench lessons (pottery-wheel / bench-pottery-wheel)

## Dead ends

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Bearing `coaxial` + shaft base mate | Shaft shifted −80 mm | Remove redundant coaxial; one mate per DOF |
| Splash pan at origin | Pan inside plinth | Mate `pan_bottom` at `Z = -PAN_DEPTH` |
| Motor mount with double Y offset | Motor floating | Foot at `(0,0,0)` after `Pos(0, motor_y, z)` reorigin |
| Wheel head revolute at shaft base | Head at Z≈68 | Explicit `Pos(0,0,0)` on plinth top |
| Belt in wrong plane | Disconnected straps | Centralize pulley layout in `drive_layout.py` |

## Patterns that work

1. **`lib/layout.py`** (or `drive_layout.py`) — all world coordinates computed from `dims.py`.
2. **Part datum at mount** — `foot`, `base`, `hub`, `pan_bottom` at local origin.
3. **`AssemblyHelper`** for coaxial + face_to_face when frames are trustworthy.
4. **`bd.Pos(layout.*) * part()`** when helper placement is ambiguous.
5. **Per-phase STEP commit** after validate + interfere pass.

## Validation order

1. Rebuild assembly
2. `step inspect validate`
3. `step inspect interfere`
4. Project `assembly_validate.py` (centers, clearances)
5. Viewer (only for gaps not yet encoded)
