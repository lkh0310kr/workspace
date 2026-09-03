# Documentation

Project documentation for the Workspace desktop app (Electron).

| Document | Description |
|----------|-------------|
| [DESIGN.md](./DESIGN.md) | Visual design philosophy and UI tokens |
| [ROADMAP.md](./ROADMAP.md) | Feature phases and completion status |
| [planning/world-engine-phase-plan.md](./planning/world-engine-phase-plan.md) | **World Engine** production phases (13+) |
| [planning/hardware-sim-phase-plan.md](./planning/hardware-sim-phase-plan.md) | **Hardware sim** (HaC + MCU/circuit) Phase 60+ |
| [planning/hardware-sim-tinkercad-roadmap.md](./planning/hardware-sim-tinkercad-roadmap.md) | **Arduino Uno lab** simulation-first Phase 70+ |
| [hardware/component-datasheet-matrix.md](./hardware/component-datasheet-matrix.md) | Hardware units, datasheet provenance, component model matrix |
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
- [Context modeling](./architecture/08-context-modeling.md) — Entity/Resource/Capability philosophy for Phase 1 modules, reference only
- [Core model](./architecture/10-core-model.md) — shared primitives (Asset, Graph, Geometry, World); tools compose via model, not pane-to-pane
- [Future native architecture](./architecture/09-future-native-architecture.md) — long-term direction, reference only

## Conventions

- Paths in architecture docs are relative to the repo root unless noted.
- Electron app code lives under `electron/`.
- Reference implementation patterns from Orca live under `ref-proj/orca/` (not shipped).
