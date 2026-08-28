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
- [ ] **GPU Service Layer** — not started until there's a real second GPU
  consumer beyond the terminal's WebGL renderer (same "extract after the
  second concrete case" rule `paneKindRegistry.ts` already modeled), but
  worth designing with Phase 2's actual target in mind now (see below) —
  a 3D/CAD/video pane is a near-certain future GPU consumer, not a
  hypothetical one.
- [x] **Engine bundle hosting protocol** — `workspace-engine://` custom
  scheme (`electron/src/main/engineBundleProtocol.ts` +
  `engineBundlePaths.ts`, 12 vitest cases) serves a pre-built engine Web
  export's static files (index.html/.js/.wasm/.pck) to a renderer
  `<webview>`, confined to an open workspace root the same way
  `mediaProtocol.ts` confines video/audio. Sets
  `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp` on every response —
  required for `SharedArrayBuffer` in a threaded Godot Web export. This
  is the first concrete piece of Phase 1 informed by Phase 2's actual
  target (see below) rather than a guess made before one was picked. No
  pane consumes it yet — that's the next step once a real exported
  bundle exists to point it at.

## Phase 2 — Graphics/design/CAD-class panes (current direction)

**Goal:** not "build many small panes" — build the foundation to
eventually host genuinely professional-grade tools in four categories
(see [`ideation.md`](./ideation.md#방향-그래픽설계cad급-pane-2026-08-현재-우선순위)):

- **2D** — Figma/Illustrator/Photoshop-class
- **3D** — Blender-class
- **Video** — a real video editor
- **Engineering** — CAD, Nvidia Omniverse-style (USD pipelines), game engines

These are all heavy rendering/compute engines — not something to
hand-roll from scratch the way Vector Editor was (that experience is
exactly why: M1-M6 of a plain SVG-DOM 2D editor was already substantial
work; Blender/CAD/Omniverse-class software is a different order of
magnitude). Default strategy is **fork/embed a real open-source engine**
per pane (candidates in `ideation.md`: Penpot/Krita for 2D, Blender
itself for 3D, Shotcut/Kdenlive for video, FreeCAD/Open CASCADE for CAD,
Godot for game engine) rather than reimplementing one — see
`ideation.md`'s fork/embed principles and
[09-future-native-architecture.md](./architecture/09-future-native-architecture.md)'s
out-of-process direction for Blender-class apps.

Engineering/analysis panes (Database Studio, Network/Packet Analyzer,
etc. — also in `ideation.md`) are **on hold, not dropped** — deprioritized
behind this direction, revisit later.

- [x] Pick which of the four categories to design toward first: **Game
  Engine (Godot)**, chosen from inside the Engineering category — not
  because "engineering" is philosophically more foundational than
  graphics, but because Godot (MIT, well-documented Web export, no
  build-complexity comparable to Blender/FreeCAD) is the cheapest way to
  validate the real unknown, which is the *hosting/integration* problem
  shared by all four categories, not any one category's own domain math.
- [x] Hosting strategy chosen: Godot's own **Web (HTML5/WASM) export**,
  loaded in a `<webview>` the same way `BrowserContent.tsx` already hosts
  arbitrary web content — not native-window embedding (platform-specific,
  much higher integration cost) and not GDExtension (runs code *inside*
  Godot's process, doesn't solve embedding Godot *inside* Workspace).
  Reuses this app's existing webview-hosting pattern almost entirely.
- [x] First infra piece built: the engine bundle hosting protocol (Phase
  1, above) — serves a Godot Web export's static files with the
  COOP/COEP headers a threaded export needs.
- [ ] Next: get an actual Godot project exported to Web and verify a
  `<webview>` pointed at `workspace-engine://...` actually loads and runs
  it end-to-end — nothing has been tested against a real export yet, only
  the serving infra.
- [ ] Once that works: a minimal "Engine" pane kind
  (`panes/kinds/engineKind.tsx` following the existing `PaneKindDefinition`
  pattern) that points a `<webview>` at an `engine:get-bundle-url` result

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
- **Vector Editor (built, then removed)** — a hand-rolled SVG-DOM 2D
  vector pane was built through M1-M6 (scene graph, SVG rendering,
  transforms, pen tool, groups, undo/redo, export, text, pan/zoom/
  marquee/z-order/align/distribute) and then deliberately deleted. Not
  because 2D/graphics direction was wrong — Phase 2 above *is* graphics/
  design/CAD — but because hand-rolling one from scratch was the wrong
  strategy for that scale of tool; the actual direction is fork/embed a
  real engine, not repeat this. Kept as a data point, not a codebase to
  resurrect as-is.

Still open from the old Phase E/G list, not yet folded into Phase 1/2
above:
- [ ] Layout export to `./.workspace/layout.json`
- [ ] GPU terminal option
- [ ] MCP / agent orchestration
- [ ] Embed cold-park + LRU webview registry
- [ ] Zod + salvage workspace persistence (partially done — layout salvage exists, see `shared/layoutSalvage.ts`)
