# world-engine-fly-demo

**Phase 14** — `input_map` + WASD/Space/Ctrl fly. Click the window for keyboard focus.

| Key | Action |
|-----|--------|
| W / S | move_z |
| A / D | move_x |
| Space | up |
| Ctrl | down |

```sh
./world-engine/qt-shell/target/debug/world-engine-qt-shell \
  apps/workspace/test-fixtures/world-engine-fly-demo
```

Headless: `cargo test --test input_contract`
