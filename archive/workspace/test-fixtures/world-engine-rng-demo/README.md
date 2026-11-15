# world-engine-rng-demo

Phase 33 smoke fixture: `sim_seed` drives Rhai `rand()` / `rand_range()`.

- `rng_director.rhai` accumulates random draws into `rng_sum` (metrics).
- `walker.rhai` performs a 1D random walk on the X axis.

Same `world-engine.json` + `step_n` → identical `rng_sum` and walker position.

```bash
cd world-engine/qt-shell
cargo run -- ../../apps/workspace/test-fixtures/world-engine-rng-demo
```
