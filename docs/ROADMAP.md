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
[`ideation.md`](./ideation.md#방향-그래픽설계cad급-pane-2026-08-현재-우선순위)
(don't merge per-app engines/document models — only the infra layer
below them is worth sharing) and given more precise shape by
[08-context-modeling.md](./architecture/08-context-modeling.md)'s
Entity/Resource/Capability/Provenance vocabulary.

Priority order (from `ideation.md`'s "공통화 우선순위"):

- [x] **File System module** — `renderer/src/fileSystem.ts`: the
  read/write/watch/search/list/reveal/directory-dialog cluster split out
  of `electron.ts`'s 369-line grab-bag into its own file, zero behavior
  change (`electron.ts` re-exports it, so no existing import site broke —
  confirmed by a clean typecheck before/after). `TreeView.tsx` (the
  heaviest consumer) now imports from `./fileSystem` directly as the new
  canonical pattern; other call sites can migrate opportunistically, no
  flag-day rewrite needed. Deliberately *not* a bigger rewrite — the IPC
  behavior itself (`main/files.ts`) was already fine, this only gives the
  cluster a real name/location instead of being undifferentiated inside
  a flat file.
- [x] **Project system** — `shared/projectManifest.ts` (pure types/zod
  schema/upsert logic, 9 vitest cases) + `main/projectManifest.ts`
  (persistence, centrally in `appSupportDir()/projects.electron.json`
  keyed by workspace root — not a new per-project-directory file, see
  its doc comment for why). Deliberately scoped to the one concrete gap
  the line above originally called out: closing a tab forgets whatever
  was in it entirely (the flexlayout JSON only tracks *currently open*
  tabs), so there was no durable "this project includes a Godot bundle
  at X" record independent of tab state. First (only, for now) writer:
  "Open as App" registers an `engine-bundle` entry. **No reader/UI yet**
  — write-only until a real second consumer needs one, per this
  project's "extract after the second concrete case" convention (see
  [08-context-modeling.md](./architecture/08-context-modeling.md)). Not
  a general document/asset database — see the Asset system item below
  for that, still separate and still not started.
- [x] **Asset system (v1: classification, not a registry)** —
  `shared/asset.ts`: `classifyAssetType()`, consolidating the "what kind
  of file is this" logic that was independently duplicated as
  `TreeView.tsx`'s `VIEWER_EXTENSIONS` array. No `electron`/`node:*`
  import (portable main/renderer, like `layoutSalvage.ts`), 8 vitest
  cases. `TreeView.tsx`'s `classifyFile` now builds on it — confirmed
  zero behavior change with a dedicated regression test asserting every
  one of the 18 originally-covered extensions still routes to the same
  pane kind. Deliberately **not** the full Entity/Resource/`AssetRef`
  registry [08-context-modeling.md](./architecture/08-context-modeling.md)
  describes — per that doc's own "physical decentralization" section, an
  asset *reference* store only earns its complexity once something
  actually needs to look assets up across panes, which nothing does yet.
  This v1 only kills the one duplication that already existed.
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
- **Engineering** — CAD, Nvidia Omniverse-style (USD pipelines), game
  engines — planning-renamed to **World Engine**, see below (category
  merge, not an implementation change)

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
- [x] Real Godot demo project built and exported — `electron/test-fixtures/godot-demo/`
  (a rotating square + live timer, proves it's actually running, not a
  screenshot), exported via the real `godot` CLI (`--headless
  --export-release "Web"`) to `electron/test-fixtures/godot-demo-web/`
  (gitignored, ~40MB — regenerate with `godot-demo/export.sh`).
- [x] "Open as App" — decided **not** to build a new "Engine" pane kind
  with its own webview lifecycle/`InteractionCoordinator` registration
  code (real risk given this app's own interaction-stability history —
  see `04-interaction-coordinator.md`). Instead, TreeView's right-click
  menu gets an "Open as App" action on any directory, which resolves the
  folder to a `workspace-engine://` URL and opens it as a **plain Browser
  tab** — reusing `BrowserContent.tsx`'s already-stable webview handling
  wholesale instead of duplicating it. `normalizeBrowserNavigationUrl`
  (`browserUrl.ts`) allowlists the `workspace-engine:` scheme so the
  webview actually loads it instead of falling back to `about:blank`.
- [x] Live verification (2026-08-28) — both the protocol smoke-test
  fixture (all self-checks passed, including `crossOriginIsolated` and
  `.wasm`'s `application/wasm` MIME) and the real Godot export (scene
  actually running — rotating square, live timer) confirmed working via
  "Open as App" in a real running Electron instance. One real bug found
  and fixed in the process: `registerEngineBundleProtocol` was wiring
  its handler onto `session.defaultSession`, but a Browser-pane
  `<webview>` always uses the separate `persist:browser` partition
  (`browserSession.ts`) — the scheme was *privileged* there
  (`registerSchemesAsPrivileged` is genuinely global) but had no handler,
  which doesn't fail as a clean 404: the guest renderer's own sandbox
  bootstrap chokes instead ("Cannot destructure property
  'preloadScripts' of 'binding.startupData' as it is null"), a white
  screen with no actionable error in the pane itself. Fixed by
  registering on `session.fromPartition(BROWSER_SESSION_PARTITION)`
  instead. **Engine bundle hosting pipeline is now verified end-to-end.**
- [x] UX port from a real reference implementation — per this doc's
  guiding principle (port real implementations, don't invent), cloned
  `ref-proj/itch` (itch.io's desktop client, MIT) — a real Electron app
  that solves exactly this problem (hosting arbitrary HTML5/WASM games,
  many of them Godot exports, inside a shell with its own UI around the
  guest content). Found and ported its `enter-html-full-screen`/
  `leave-html-full-screen` handling
  (`src/main/reactors/winds.ts`): when a hosted game's own in-canvas
  fullscreen button is clicked, Electron already makes the real OS
  window fullscreen for free, but this app's own chrome (titlebar,
  Browser pane's nav/address row) stayed visible around it until now —
  `useHtmlFullscreen.ts` + a `.html-fullscreen` CSS class hides both
  while active, restores on exit. Pending live QA (see `TODO.md`).
- [x] One-click "Export Godot (Web) & Open" (2026-08-28) — the original
  ask ("난 그냥 workspace에 넣어서 검증하면 되도록 쉽게 더 완성도 있는
  파이프라인을 만들어야지") was still two manual steps: run `export.sh`
  yourself, then right-click the *output* folder for "Open as App".
  TreeView's right-click menu on a *project* folder now offers "Export
  Godot (Web) & Open" directly: `godotExport.ts` resolves the `godot`
  binary (PATH, then common install locations, same pattern as
  `pty.ts`'s tmux resolution), reads `export_presets.cfg` to find the
  Web preset by name (doesn't hardcode `"Web"`), and spawns
  `godot --headless --export-release <preset> ...` **async**
  (`child_process.spawn`, not `spawnSync` — an export can take a while
  and this is the main process; blocking it would freeze the whole app).
  Output goes to a sibling `<project>-web` folder (matching
  `godot-demo`/`godot-demo-web`'s own convention) and opens automatically
  via the same flow as "Open as App" on success; a failure (godot not
  found, no Web preset configured, export error) surfaces through
  `ErrorLogPanel` via `logError`. Live-verified (not just typecheck) by
  invoking `exportGodotProjectWeb` directly against the real
  `test-fixtures/godot-demo` fixture — real `godot` CLI ran, produced a
  correct bundle (`index.html`/`.js`/`.pck`/`.wasm`/audio worklets).
  Pending live QA through the actual TreeView menu (see `TODO.md`).

### World Engine — planning idea, not started (2026-08-28)

Raised: should "Game Engine" and "engineering simulation" (the Omniverse-
style entry under **Engineering** above) stay separate categories, or
collapse into one **World Engine** category?

**Verdict: collapse the *category name*, but not the hosting mechanism.**
The category split ("game" vs "simulation") was never really about the
domain math — a real-time 3D world is a real-time 3D world whether it's
rendering a game level or a robotics/physics scene. The split that
actually matters is **how the engine gets embedded**, and that splits
engines into two groups regardless of game-vs-simulation labeling:

- **Web/WASM-exportable** (Godot, likely Three.js-based sims, anything
  with a real browser export target) — hosted exactly like today: export
  to static files, serve via `workspace-engine://`
  (`engineBundleProtocol.ts`), open as a plain Browser tab. Nothing new
  needed here; this is the path already verified end-to-end above.
- **Native-only** (Nvidia Omniverse/Kit, FreeCAD, and most real CAD/FEA —
  no WASM export exists, Omniverse is a native RTX/USD app or a
  cloud-streamed client, not something that runs in a browser sandbox) —
  would need an entirely different embedding pattern: spawn as a real OS
  process and embed/control its window, closer to how the terminal pane
  manages a spawned `node-pty` process than to how the Browser pane hosts
  a `<webview>`. Not built, not designed yet — this is the genuinely new
  unknown, not a variant of the already-solved web-bundle path.

So: rename the planning category to **World Engine** (one place to look
for "real-time 3D host" panes), but keep two implementation tracks under
it — **web-bundle** (solved, Godot proves it) and **native-embed**
(unsolved, needed for Omniverse/CAD-class engines). Whichever engine gets
picked next decides which track gets built; no work started on
native-embed yet.

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
