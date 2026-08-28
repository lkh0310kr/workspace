# Roadmap

## Guiding principle (applies to every phase below)

Port/copy proven implementations from real projects instead of inventing
from scratch. This is already how this app was built — terminal and
browser were both ported from Orca (`ref-proj/orca`), not designed from
zero. Same rule going forward: before designing a new foundation module
or pane, find a real open-source implementation that already solved the
problem, clone it into `ref-proj/` (read-only reference, gitignored —
see any architecture doc's "Reference: porting from X" section for the
pattern), and verify/port against it rather than guessing.

## Phase 1 — Foundation architecture (stability first)

**Goal:** architect the shared lower layer well *before* building many
panes on top of it. Right now every pane (Terminal, Browser, Code/
Markdown, Viewer, RSS) implements its own version of things that should
be common infrastructure — this phase formalizes those into shared
modules, informed by the "Workspace SDK" principles in
[`ideation.md`](./ideation.md#방향-전환-creative-pane--엔지니어링분석-pane-2026-08)
(don't merge per-app engines/document models — only the infra layer
below them is worth sharing).

Priority order (from `ideation.md`'s "공통화 우선순위"):

- [ ] **File System module** — formalize the existing IPC read/write/
  watch/list surface as a reusable module boundary other panes call
  through, not each pane's own ad-hoc `../electron` imports.
- [ ] **Project system** — a `workspace.json`-style manifest per
  workspace root (currently just a raw file tree with no per-app
  document registry or "what was open last" beyond the flexlayout JSON).
- [ ] **Asset system** — a typed asset model (image/font/audio/video/
  document, id/type/name/source/metadata) shared across panes, instead
  of each pane parsing files its own way.
- [ ] **Clipboard protocol** — cross-pane data types
  (`application/x-workspace-*` MIME conventions) so copying structured
  data from one pane and pasting into another is a real, defined
  contract, not accidental.
- [ ] **Command Bus** — panes register their own commands
  (`db.query.run`, `packet.filter.apply`, etc.) into one registry, laying
  the groundwork for a future ⌘K command palette across the whole app.
- [ ] **Shortcut Registry** — a real `Workspace > App > Document`
  priority/conflict model, replacing today's scattered per-component
  `keydown` listeners each guessing at conflicts independently.
- [ ] **GPU Service Layer** — only if/when a GPU-heavy pane actually
  needs shared adapter/device/memory-budget info. Not started until
  there's a real second GPU consumer beyond the terminal's WebGL
  renderer — same "extract after the second concrete case" rule
  `paneKindRegistry.ts` already modeled.

## Phase 2 — Panes built on the foundation

**Goal:** once Phase 1's modules exist, build multiple engineering/
analysis panes that actually *use* them — not each reinventing file/
project/clipboard/shortcut handling the way every pane has so far.
Candidate list and priority in
[`ideation.md`](./ideation.md#방향-전환-creative-pane--엔지니어링분석-pane-2026-08):
Database Studio, Network/Packet Analyzer, Serial/Embedded Studio, Hex/
Binary Inspector, GIS/Map Studio, Git/Code Archaeology, Robot Simulator,
Research/Paper Reader.

- [ ] Pick the first pane (not decided yet — next session)
- [ ] For the chosen pane: research real open-source implementations to
  port from (license, core engine, how it'd embed in Electron) — per
  this doc's guiding principle, same as Orca was for terminal/browser
- [ ] Build it using Phase 1's modules where they exist yet; note any
  gap in Phase 1 the pane surfaces (a real second consumer is exactly
  when a Phase 1 module's design gets validated or corrected)

## History (done)

Earlier build-out, kept for the record rather than deleted:

- **Instant terminal** — removed GPU from boot path, xterm.js + PTY byte
  stream, Vite + React frontend.
- **4-pane shell** — flexlayout 2×2 grid, Code/Markdown/Terminal/Browser
  pane types, workspace tab rail.
- **Editors** — CodeMirror code pane + file open/save, Markdown WYSIWYG
  split, file watcher.
- **Browser** — 2-row chrome (‹ › ↻ + URL bar), child webview host, frame
  sync on resize/split.
- **Interaction stability** — InteractionCoordinator (overlay stack,
  webview pointer-events, portal registry), Orca-style terminal pipeline
  (PtySession replay, single-leaf pane manager, WebGL refit), workspace
  tab keep-mounted visibility model. See
  [docs/architecture/README.md](./architecture/README.md).
- **Zustand workspace-scope store** — workspace hydration, layout
  models, pane active tabs, coordinator bridge.
- **Creative panes (built, then removed)** — a Vector Editor pane was
  built through M1-M6 (scene graph, SVG rendering, transforms, pen tool,
  groups, undo/redo, export, text, pan/zoom/marquee/z-order/align/
  distribute) and then deliberately removed once direction shifted to
  engineering/analysis panes (Phase 2 above). Nothing in that family
  (Vector, Pixel Art, Diagram, Presentation, 2D Animation, Paint, 3D
  Modeler) is planned.

Still open from the old Phase E/G list, not yet folded into Phase 1/2
above:
- [ ] Layout export to `./.workspace/layout.json`
- [ ] GPU terminal option
- [ ] MCP / agent orchestration
- [ ] Embed cold-park + LRU webview registry
- [ ] Zod + salvage workspace persistence (partially done — layout salvage exists, see `shared/layoutSalvage.ts`)
