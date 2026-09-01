# world-engine-trigger-demo

**Phase 15** — trigger zone (`trigger: true`) + `on_collision` Rhai callback.

WASD to move the player into the green goal box. On enter, the player rises (visual feedback).

```sh
./native/world-engine-qt-shell/target/debug/world-engine-qt-shell \
  electron/test-fixtures/world-engine-trigger-demo
```

Headless: `cargo test --test collision_contract`
