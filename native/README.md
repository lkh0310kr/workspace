# native/

Standalone Rust crates outside `electron/` — not bundled by the Electron
app's own tooling except where noted below. Architecture:
[`docs/architecture/09-future-native-architecture.md`](../docs/architecture/09-future-native-architecture.md).
Windows packaging: [`docs/windows-build.md`](../docs/windows-build.md).

## `world-engine-core/` — the engine library

Rendering (`wgpu`) + physics (`rapier3d`) + ECS (`hecs`). Game/simulation
code links this crate; shells (`qt-shell`, `electron-embed`) only provide a
native surface and input.

```sh
cd native/world-engine-core
cargo run --example chase    # headless smoke test
```

## `world-engine-qt-shell/` — **default** Workspace integration

Qt window shell; Workspace spawns it as a child process
(`electron/src/main/worldEngine.ts`). TreeView → **Open in World Engine**.

```sh
# macOS
brew install qt && cargo build

# Windows (PowerShell)
.\scripts\build-windows.ps1 -Release
```

See [`world-engine-qt-shell/README.md`](world-engine-qt-shell/README.md).

## `world-engine-electron-embed/` — experimental in-pane embed

Native Node addon: `world-engine-core` renders into Electron's window
(NSView / child HWND). **Not the default** — qt-shell separate window is.
Dev menu: **Launch Embedded Engine (experimental)**.

```sh
cd electron && npm run build:native:embed
```

## Archived / not in tree

| Topic | Record |
|-------|--------|
| WebRTC Track B (`engine-stream-poc`) | [`docs/research/track-b-webrtc-streaming.md`](../docs/research/track-b-webrtc-streaming.md) |

## Packaging

- `electron/scripts/stage-world-engine-win.mjs` — stages qt-shell + Qt DLLs
- `electron-builder.yml` — `extraResources` → `resources/world-engine/`
- Each crate's `target/` is gitignored; `Cargo.lock` is committed.
