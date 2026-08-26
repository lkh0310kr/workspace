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
| Terminal | xterm.js + node-pty (wrapped in tmux for persistence across restarts) |
| Editor | CodeMirror 6 |
| Markdown | CodeMirror live-preview (Obsidian-style) |
| Browser | Electron `<webview>` guest |

## Layout

```
electron/src/main/      Workspace model, PTY, file I/O, IPC handlers
electron/src/preload/   IPC bridge exposed to the renderer as window.api
electron/src/renderer/  React UI (panes, layout, editor)
legacy-tauri/            Archived Tauri 2 + Rust implementation this app replaced
```

## History

This was originally built on Tauri 2 (Rust shell, Wry child webview for the
browser pane, portable-pty for the terminal). It moved to Electron to adopt
[Orca](https://github.com)'s already-solved approach for the terminal's IME
handling and the browser pane's compositing, after Tauri's native-child-webview
model produced z-order and async-detach bugs, and unsigned Rust builds kept
tripping macOS Gatekeeper quarantine. The old implementation is kept under
`legacy-tauri/` for reference — it still builds (`cd legacy-tauri && cargo run
-p workspace-app`) but isn't developed further.
