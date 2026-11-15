# world-engine

Workspace용 실시간 3D 엔진 — `wgpu` + `rapier3d` + `hecs` + Rhai.

| Crate | 역할 |
|-------|------|
| [`core/`](./core) | Engine library: simulation, rendering, save/load |
| [`qt-shell/`](./qt-shell) | Default shell — Qt window spawned by the desktop app |

실험적인 pane 내부 Electron 임베드는 [`archive/world-engine-embed/`](../archive/world-engine-embed)에 있습니다(현재 빌드하지 않음).

```sh
# From repo root
cargo test -p world-engine-core
cargo run -p world-engine-qt-shell --example chase   # headless smoke (core)
cd world-engine/qt-shell && cargo build              # dev shell binary
```

데스크톱 통합: [`apps/workspace/src/main/worldEngine.ts`](../apps/workspace/src/main/worldEngine.ts).
아키텍처: [`docs/architecture/09-tool-hosting.md`](../docs/architecture/09-tool-hosting.md).
