# world-engine

Real-time 3D engine for Workspace — `wgpu` + `rapier3d` + `hecs` + Rhai.

| Crate | Role |
|-------|------|
| [`core/`](./core/) | Engine library: simulation, rendering, save/load |
| [`qt-shell/`](./qt-shell/) | Default shell — Qt window spawned by the desktop app |

Experimental in-pane Electron embed lives in [`archive/world-engine-embed/`](../archive/world-engine-embed/) (not built).

```sh
# From repo root
cargo test -p world-engine-core
cargo run -p world-engine-qt-shell --example chase   # headless smoke (core)
cd world-engine/qt-shell && cargo build              # dev shell binary
```

Desktop integration: [`apps/workspace/src/main/worldEngine.ts`](../apps/workspace/src/main/worldEngine.ts).  
Architecture: [`docs/architecture/09-future-native-architecture.md`](../docs/architecture/09-future-native-architecture.md).
