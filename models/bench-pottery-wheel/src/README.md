# bench-pottery-wheel models

| Script | Phase | Output |
|--------|-------|--------|
| `wheel_head.py` | B0–B1 | `../STEP/wheel_head.step` |
| `splash_pan.py` | B2 | `../STEP/splash_pan.step` (2 solids) |
| `plinth.py` | B3 | `../STEP/plinth.step` |
| `shaft.py` | B3 | `../STEP/shaft.step` |
| `assembly.py` | B3 | `../STEP/assembly.step` |

Build root: `python assembly.py` (rebuilds stale children).
