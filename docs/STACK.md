# Stack

## Current (Tauri 2)

| Layer | Tech |
|-------|------|
| Shell | Tauri 2 (`src/`) |
| UI | React + Vite + flexlayout-react (`ui/`) |
| Workspace model | `workspace-core` crate |
| Terminal | xterm.js + portable-pty |
| Editor | CodeMirror 6 |
| Markdown | CodeMirror + marked preview |
| Browser | Wry child webview (`BrowserHost` in `src/browser_host.rs`) |

## Repo layout

```
.
├── src/                   Tauri app + BrowserHost
├── crates/workspace-core/ PTY, tabs, files
├── crates/terminal-gpu/   Optional wgpu renderer (unused)
├── ui/                    React frontend
├── tauri.conf.json
└── capabilities/
```

## BrowserHost

The browser pane uses a **2-row HTML chrome** (pane header + URL toolbar) and a native child webview for page content:

1. React measures the pane shell (`pane-shell` ref) and calls `browser_report_frame`.
2. Rust subtracts chrome height (70px) and positions/shows the Wry webview in the content area.
3. `browser_hide_all` runs on workspace tab switches; `browser_detach` on pane unmount.

## Historical note

The project migrated from Slint to Tauri 2. See `docs/ideation.md` for the original rationale.
