# world-engine-trigger-demo

**Phase 15** — trigger zone (`trigger: true`)과 `on_collision` Rhai callback입니다.

WASD로 플레이어를 초록색 목표 상자 안으로 이동합니다. 진입하면 시각적 피드백으로 플레이어가 상승합니다.

```sh
./world-engine/qt-shell/target/debug/world-engine-qt-shell \
  apps/workspace/test-fixtures/world-engine-trigger-demo
```

headless 실행: `cargo test --test collision_contract`
