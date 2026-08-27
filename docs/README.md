# Documentation

Project documentation for the Workspace desktop app (Electron).

| Document | Description |
|----------|-------------|
| [DESIGN.md](./DESIGN.md) | Visual design philosophy and UI tokens |
| [ROADMAP.md](./ROADMAP.md) | Feature phases and completion status |
| [ideation.md](./ideation.md) | Product ideas and pane types |
| [architecture/README.md](./architecture/README.md) | **System architecture** — start here for code structure |

## Architecture (quick links)

- [Overview](./architecture/01-overview.md) — processes, layers, data flow
- [Process & IPC](./architecture/02-process-and-ipc.md) — main ↔ renderer bridge
- [Workspace & layout](./architecture/03-workspace-and-layout.md) — tabs, flexlayout, PaneGroup
- [Interaction coordinator](./architecture/04-interaction-coordinator.md) — overlay, pointer-events, portals
- [Terminal pipeline](./architecture/05-terminal-pipeline.md) — PTY, xterm, WebGL, pane manager
- [Browser embeds](./architecture/06-browser-embeds.md) — webview lifecycle and navigation
- [Future phases](./architecture/07-future-phases.md) — planned Zustand, cold-park, persistence
- [Vector editor](./architecture/08-vector-editor.md) — creative-pane design; M1-M5 built, pending live GUI QA
- [Future native architecture](./architecture/09-future-native-architecture.md) — long-term direction, reference only
- [Creative panes UX roadmap](./architecture/10-creative-panes-ux-roadmap.md) — Penpot-informed UX backlog for Vector Editor and future Pixel Art

## Conventions

- Paths in architecture docs are relative to the repo root unless noted.
- Electron app code lives under `electron/`.
- Reference implementation patterns from Orca live under `ref-proj/orca/` (not shipped).
