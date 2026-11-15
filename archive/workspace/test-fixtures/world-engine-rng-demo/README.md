# world-engine-rng-demo

Phase 33 smoke fixture: `sim_seed`가 Rhai `rand()` / `rand_range()`를 구동합니다.

- `rng_director.rhai`는 무작위 추출값을 `rng_sum` (metrics)에 누적합니다.
- `walker.rhai`는 X축에서 1차원 random walk를 수행합니다.

같은 `world-engine.json`과 `step_n`에는 같은 `rng_sum` 및 walker 위치가 대응합니다.

```bash
cd world-engine/qt-shell
cargo run -- ../../apps/workspace/test-fixtures/world-engine-rng-demo
```
