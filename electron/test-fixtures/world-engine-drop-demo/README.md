# world-engine-drop-demo

**Phase 13** — initial `velocity` + gravity parabolic arc. No scripts; pure physics contract demo.

```sh
./native/world-engine-qt-shell/target/debug/world-engine-qt-shell \
  electron/test-fixtures/world-engine-drop-demo
```

Headless:

```sh
cd native/world-engine-core
cargo test --test simulation_contract
```

Orange sphere launches at `[4, 3, 0]` m/s from height 8 m and follows a ballistic arc.
