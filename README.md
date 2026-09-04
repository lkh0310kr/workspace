# Workspace

4-pane native workspace: **Code + Markdown + Terminal + Browser** in one view.

## Run

```bash
cd apps/workspace
npm install
npm run dev
```

Production build: `npm run build` (then `npm run build:mac` / `build:win` / `build:linux` for a distributable).

## Layout

```
apps/workspace/     Electron desktop app (main · preload · renderer)
world-engine/       Rust engine — core · qt-shell · embed
hardware-sim/       Rust circuit simulator — core
schemas/            Shared JSON schemas
docs/               Architecture & planning
ref-proj/           Reference OSS (read-only; not shipped)
```

Rust workspace: `cargo test` from repo root.

## Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 42 + electron-vite |
| UI | React + flexlayout-react |
| Terminal | xterm.js + node-pty |
| Editor | CodeMirror 6 |
| Markdown | CodeMirror live-preview |
| Browser | Electron `<webview>` guest |

Reference implementation (not shipped): `ref-proj/orca/`.

## World Engine

Workspace's real-time 3D engine (`world-engine/core`). The desktop app spawns
`world-engine/qt-shell` as a child process — app menu → **World Engine → Launch
World Engine (dev)**, or TreeView → **Open in World Engine** on a folder with
`world-engine.json` (example: `apps/workspace/test-fixtures/world-engine-demo/`).

See [`world-engine/README.md`](./world-engine/README.md) and
[`docs/architecture/09-future-native-architecture.md`](./docs/architecture/09-future-native-architecture.md).

## History

Originally Tauri 2; moved to Electron for Orca-style terminal IME, browser
webview lifecycle, and pane patterns (`ref-proj/orca`).
