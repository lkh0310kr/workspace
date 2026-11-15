# world-engine-fly-demo

**Phase 14** — `input_map`을 이용한 WASD/Space/Ctrl 비행입니다. 창을 클릭해 키보드 포커스를 맞춥니다.

| 키 | 동작 |
|-----|--------|
| W / S | move_z |
| A / D | move_x |
| Space | up |
| Ctrl | down |

```sh
./world-engine/qt-shell/target/debug/world-engine-qt-shell \
  apps/workspace/test-fixtures/world-engine-fly-demo
```

headless 실행: `cargo test --test input_contract`
