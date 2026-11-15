# world-engine-drop-demo

**Phase 13** — 초기 `velocity`와 중력에 따른 포물선 궤적입니다. script 없이 물리 계약만 보여주는 데모입니다.

```sh
./world-engine/qt-shell/target/debug/world-engine-qt-shell \
  apps/workspace/test-fixtures/world-engine-drop-demo
```

headless 실행:

```sh
cd world-engine/core
cargo test --test simulation_contract
```

주황색 구체가 높이 8 m에서 `[4, 3, 0]` m/s로 출발해 탄도 궤적을 따릅니다.
