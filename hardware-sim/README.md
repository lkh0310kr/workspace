# hardware-sim

Deterministic Hardware-as-Code circuit kernel — separate from World Engine's 3D physics.

| Crate | Role |
|-------|------|
| [`core/`](./core/) | Validation, circuit graph, JSON-lines runtime, `hardware-sim` CLI |

```sh
cargo test -p hardware-sim-core
cargo run -p hardware-sim-core --example button_led
```

Desktop integration: [`apps/workspace/src/main/hardwareSim.ts`](../apps/workspace/src/main/hardwareSim.ts).  
Plan: [`docs/planning/hardware-sim-phase-plan.md`](../docs/planning/hardware-sim-phase-plan.md).
