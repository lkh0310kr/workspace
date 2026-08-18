# Roadmap

## Phase A — Instant terminal (done)

- [x] Remove GPU from boot path
- [x] xterm.js + PTY byte stream
- [x] Vite + React frontend

## Phase B — 4-pane shell (done)

- [x] flexlayout 2×2 grid
- [x] Pane types: Code, Markdown, Terminal, Browser
- [x] Workspace tab rail

## Phase C — Editors (done)

- [x] CodeMirror code pane + file open/save
- [x] Markdown WYSIWYG split (editor + preview)
- [x] notify file watcher

## Phase D — Browser (done)

- [x] Browser pane with 2-row chrome (‹ › ↻ + URL bar)
- [x] Wry child webview via BrowserHost
- [x] Frame sync on resize / split drag

## Phase E — Polish

- [x] Multi-tab × per-tab layout (flexlayout JSON)
- [ ] Layout export to `./.workspace/layout.json`
- [ ] GPU terminal option (`terminal-gpu` crate)
- [ ] MCP / agent orchestration
