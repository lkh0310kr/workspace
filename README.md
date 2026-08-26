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
```

Reference implementation (not shipped): `ref-proj/orca/` — Orca Electron app; port patterns from here.

## History

This app was originally built on Tauri 2, then moved to Electron to adopt Orca's
(`ref-proj/orca`) terminal IME, browser webview lifecycle, and pane-manager
patterns. The old Tauri tree was removed; use `ref-proj/orca` for reference, not
the former `legacy-tauri` archive.
