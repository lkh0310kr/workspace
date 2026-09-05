# bench-pottery-wheel models

| Script | Phase | Output |
|--------|-------|--------|
| `wheel_head.py` | B0–B1 | `../STEP/wheel_head.step` |
| `splash_pan.py` | B2 | `../STEP/splash_pan.step` (2 solids) |
| `plinth.py` | B3, B8 | `../STEP/plinth.step` |
| `shaft.py` | B3–B4 | `../STEP/shaft.step` |
| `motor_mount.py` | B4 | `../STEP/motor_mount.step` (3 solids) |
| `drive_belt.py` | B4 | `../STEP/drive_belt.step` |
| `assembly.py` | root | `../STEP/assembly.step` |

Build root: `python assembly.py` (rebuilds stale children).
