# Workspace

4-pane native workspace: **Code + Markdown + Terminal + Browser** in one view.

## Run

```bash
# Development (Vite HMR + Tauri)
cd ui && npm install && cd ..
cargo run -p workspace-app

# Production UI build
cd ui && npm run build && cd ..
cargo run -p workspace-app --release
```

## Stack

| Layer | Tech |
|-------|------|
| Shell | Tauri 2 |
| UI | React + Vite + flexlayout-react |
| Terminal | xterm.js + portable-pty (instant boot, no GPU) |
| Editor | CodeMirror 6 |
| Markdown | CodeMirror + marked preview |
| Browser | Wry child webview via `BrowserHost` |
| Core | `workspace-core` crate |

## Layout

```
crates/workspace-core/   PTY sessions, workspace model, file I/O
crates/terminal-gpu/     Archived wgpu renderer (optional, unused)
src/                     Tauri commands, PTY poll, BrowserHost
ui/                      Vite frontend (build → ui/dist)
```

## Architecture

```
┌─────────────┬─────────────┐
│ Code        │ Browser     │
├─────────────┼─────────────┤
│ Markdown    │ Terminal    │
└─────────────┴─────────────┘
     Workspace tab rail (left)
```

PTY protocol: `pty_write` / `pty_resize` commands, `pty-output` events (base64 bytes).

Browser: React reports shell rect via `browser_report_frame`; Rust positions a child Wry webview below the 2-row chrome (title bar + URL toolbar).
