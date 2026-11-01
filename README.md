# Workspace

Native workspace shell for **Code + Markdown + Terminal + Browser**, with the PKMS client available as a pane.

## Run

```bash
npm install
cd apps/workspace
npm run dev
```

The Web client and Cloudflare Worker are in `apps/web`. Install the root npm workspaces once, then run `npm run web:dev` or `npm run web:deploy` from the repository root.

Production build: `npm run build` (then `npm run build:mac` / `build:win` / `build:linux` for a distributable).

## Layout

```
apps/workspace/     Electron desktop app (main · preload · renderer)
apps/web/           PKMS web client and Cloudflare Worker
apps/ios/           PKMS SwiftUI app and archived v1 client
packages/pkms-client/ Shared PKMS React UI used by Web and Workspace
packages/pkms-core/   PKMS Rust workspace (core · wasm · ffi)
packages/pkms-protocol/ HTTP and realtime protocol schemas
world-engine/       Rust engine — core · qt-shell · embed
hardware-sim/       Rust circuit simulator — core
schemas/            Shared JSON schemas
docs/               Architecture, planning, and PKMS project docs
ref-proj/           Reference OSS (read-only; not shipped)
```

Workspace Rust tests: `cargo test` from the repository root. PKMS Rust tests: `cargo test --manifest-path packages/pkms-core/Cargo.toml`.

## Agent skills (CAD / CAE)

Skills for Cursor, Claude Code, and Codex live under [`.agents/`](.agents). CAD workflows need Python 3.11+:

```bash
npm run agents:python:setup
npm run agents:cad:verify
```

See [`.agents/README.md`](.agents/README.md).

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
[`docs/planning/native-architecture.md`](./docs/planning/native-architecture.md).

## History

Originally Tauri 2; moved to Electron for Orca-style terminal IME, browser
webview lifecycle, and pane patterns (`ref-proj/orca`).
