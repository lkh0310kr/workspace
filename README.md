# Workspace

4-pane native workspace: **Code + Markdown + Terminal + Browser** in one view.

## Run

```bash
cd electron
npm install
npm run dev
```

Production build: `npm run build` (then `npm run build:mac` / `build:win` / `build:linux` for a distributable).

## Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 42 + electron-vite |
| UI | React + flexlayout-react |
| Terminal | xterm.js + node-pty (direct login-shell spawn, Orca-style — no tmux wrapper; one was tried for quit/relaunch persistence and reverted after it broke scrollback for TUIs like Claude Code's CLI, see `electron/src/main/pty.ts`) |
| Editor | CodeMirror 6 |
| Markdown | CodeMirror live-preview (Obsidian-style) |
| Browser | Electron `<webview>` guest |

## Layout

```
electron/src/main/      Workspace model, PTY, file I/O, IPC handlers
electron/src/preload/   IPC bridge exposed to the renderer as window.api
electron/src/renderer/  React UI (panes, layout, editor)
native/                 Standalone Rust crates outside the Electron app — see native/README.md
```

Reference implementation (not shipped): `ref-proj/orca/` — Orca Electron app; port patterns from here.

## World Engine

Workspace's own real-time 3D engine — not a hosted third-party one, but
assembled from `wgpu` + `rapier3d` + `hecs`, running as a real native
window Workspace spawns/manages (`native/world-engine-qt-shell/`,
`electron/src/main/worldEngine.ts`). Try it: app menu → **World Engine →
Launch World Engine (dev)**, or right-click a folder containing
`world-engine.json` in the file tree → **Open in World Engine** (a real
example lives at `electron/test-fixtures/world-engine-demo/`). Full
story, including why it isn't an embedded pane, in
[`native/README.md`](./native/README.md) and
[`docs/architecture/09-future-native-architecture.md`](./docs/architecture/09-future-native-architecture.md).

## History

This app was originally built on Tauri 2, then moved to Electron to adopt Orca's
(`ref-proj/orca`) terminal IME, browser webview lifecycle, and pane-manager
patterns. The old Tauri tree was removed; use `ref-proj/orca` for reference, not
the former `legacy-tauri` archive.
