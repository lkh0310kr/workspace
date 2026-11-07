# hardware-sim

Deterministic Hardware-as-Code circuit kernel — separate from World Engine's 3D physics.

| Crate | Role |
|-------|------|
| [`core/`](./core) | Validation, circuit graph, JSON-lines runtime, `hardware-sim` CLI |

```sh
cargo test -p hardware-sim-core
cargo run -p hardware-sim-core --example button_led
```

Desktop integration: [`apps/workspace/src/main/hardwareSim.ts`](../apps/workspace/src/main/hardwareSim.ts). Current implementation scope: [feature status](../docs/planning/feature-status.md).
