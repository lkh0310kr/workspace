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

## Phase F — Interaction stability (done)

- [x] InteractionCoordinator — overlay stack, webview pointer-events, portal registry
- [x] Orca-style terminal pipeline (PtySession replay, single-leaf pane manager, WebGL refit)
- [x] Workspace tab keep-mounted visibility model (no full layout remount)
- [x] Architecture docs in `docs/architecture/`

See [docs/architecture/README.md](./architecture/README.md).

## Phase G — Planned

- [x] Zustand workspace-scope store (Phase 2) — workspace hydration, layout models, pane active tabs, coordinator bridge
- [ ] Embed cold-park + LRU webview registry (Phase 3)
- [ ] Zod + salvage workspace persistence (Phase 4)
