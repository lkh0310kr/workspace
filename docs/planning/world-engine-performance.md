# Performance budget (Phase 25 / 29)

Target: **M-series Mac, debug build, headless**

| Metric | Budget |
|--------|--------|
| 500 dynamic spheres × 60 steps | < 5 s |
| Single fixture load + 120 steps | < 1 s |

Validated by `tests/benchmark_smoke.rs`.

Release builds expected 5–10× faster.
