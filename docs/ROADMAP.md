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
- **No web export** (Omniverse-class, most production CAD, engines without
  web-build buy-in) — **not** true native window embedding after all (see
  research below): NVIDIA Omniverse's own answer to this exact problem is
  **pixel-streaming** — the native process renders normally and streams
  its frames over WebRTC to a plain HTML/JS client page, which is just
  another URL the Browser pane can open. Not built yet, but the pattern
  is real and proven (NVIDIA ships it in production), not a guess.

So: rename the planning category to **World Engine** (one place to look
for "real-time 3D host" panes), with two implementation tracks — both
ending at "opens as a Browser tab," so neither needs a new pane kind —
**web-bundle** (solved, Godot proves it) and **pixel-streaming** (design
+ feasibility spike done — see
[09-future-native-architecture.md](./architecture/09-future-native-architecture.md#unified-hosting-design-research-pass-2026-08-28--no-native-window-embedding-needed-so-far)).
Researching real candidates (Bevy, MonoGame, Omniverse, FreeCAD) found
that **true native-window embedding has no clean cross-platform path at
all** (three open, unresolved Electron issues) and, encouragingly, isn't
actually needed for any real candidate found so far — Bevy and FreeCAD
both turned out to have their own WASM export paths (web-bundle track,
not a new problem).

- [x] Pixel-streaming feasibility spike (2026-08-28) —
  `native/engine-stream-poc/`, a standalone Rust binary (not wired into
  Electron), proved the core chain for real: synthetic frames → `openh264`
  software encode → `webrtc-rs` → a real WebRTC client (verified with
  Python's `aiortc`, receiving 5 correctly-sized, correctly-timed decoded
  video frames, not just "the server started"). One real bug found via
  this testing and fixed (RTP payload type read before negotiation
  finished — see the doc for detail). Still not done: capturing an actual
  engine's frames, hardware encoding, the input round-trip — real next
  increments once a concrete engine needs them, not blocking this spike's
  own conclusion (the transport mechanism itself is implementable here,
  not just plausible on paper).

**Direction correction (2026-08-28): "World Engine" means building one,
not hosting one.** Everything above answers "how do we host a third-party
engine's output in a pane" — the user clarified Workspace should have its
**own** real engine, assembled from open-source Rust libraries (rendering/
physics/ECS), not embed/stream someone else's black box. Built and
verified `native/world-engine-core/` — `wgpu` + `rapier3d` + `hecs`, one
real physics-driven cube (falls, bounces, visibly rotates — confirmed via
60 real decoded frames inspected as images, not just "it compiled").
Reused `engine-stream-poc`'s WebRTC transport to show it — **then
reconsidered that choice and found it wrong for this case**: WebRTC solves
problems (NAT traversal, untrusted networks, browser cross-origin
security) that don't exist between a process this app spawns and this
app's own main process on the same machine. The real cost wasn't
hypothetical — lossy compression, an ICE handshake, and today's own
payload-type negotiation bug all exist purely because of WebRTC's
negotiation model, not the actual problem. The right shape already exists
in this codebase: the terminal's `Pty` → `PtySession` → IPC → `xterm.js`
pipeline solves the identical "spawned native process's output needs to
reach the renderer" problem with a plain byte stream, no compression, no
negotiation. `engine-stream-poc`/WebRTC isn't wasted — it's still the
right answer for Track B (a genuine third-party/remote engine), just not
for Workspace's own.

**Further research (2026-08-28): local IPC + `<canvas>` still isn't
"native-grade" enough — found a better, real answer.** The user pushed
for genuine Blender/Unity-grade fidelity ("완전히 다를 게 없어야 해. 네이티브
급으로"), not just "better than WebRTC." Local IPC still round-trips every
frame through a CPU readback. Found and verified a real working technique
instead: Electron's `getNativeWindowHandle()` + a native Rust addon
(`napi-rs`) creates our **own** native view (not someone else's window —
one we fully control), adds it as a subview of Electron's own window
(`raw-window-handle`, the same crate `wgpu`/`winit` use), and `wgpu`
presents **directly** to that native surface every frame — zero CPU
readback, zero IPC frame transfer, genuinely the same rendering path any
native app uses. Verified against a real reference implementation
(monkeynut.org, macOS/NSView) — not assumed. This supersedes the local-IPC
design as the real integration target; local IPC stays documented as a
fallback. One real open question: whether Electron's transparent web
layer can be made to pass mouse/keyboard input through to the embedded
native view — this project's existing `InteractionCoordinator`
(`04-interaction-coordinator.md`) solves the closely related `<webview>`
version of this problem, and whether the same approach extends to a
native view is the next concrete thing to check. Full detail in
[09-future-native-architecture.md](./architecture/09-future-native-architecture.md#even-better-than-local-ipc--canvas-render-directly-into-a-native-embedded-view-2026-08-28).

**Phases 1-3 built and verified, then a deliberate pivot (2026-08-28).**
User asked to see this through rather than stop at "designed" — built:

- [x] **Phase 1**: `native/world-engine-qt-shell/` — Qt (the researched
  "정석"/canonical cross-platform toolkit real tools like Blender/DaVinci
  Resolve's category actually use) creates a real native window; `wgpu`
  renders directly into it. Standalone process. Live-verified on-screen
  by the user directly.
- [x] **Phase 2**: `native/world-engine-electron-embed/` — a native Node
  addon (`napi-rs`) proving the in-process embed technique above actually
  works: loaded into a real Electron process, embeds our own `NSView` as
  a subview, `wgpu` renders into it directly. Verified against a real
  (throwaway) Electron process — loads, embeds, renders continuously, no
  crash.
- **Pivot**: Phase 2 worked, but its input-forwarding follow-up has no
  reference implementation anywhere — genuinely open research risk.
  Asked directly ("그냥 일렉트론이랑 앱을 분리할까?"), and decoupled instead:
  World Engine runs as its own separate native window (Phase 1's
  artifact), which Workspace spawns/manages — zero input problem, since
  it's a real independent native window. Phase 2 stays documented as a
  proven option, not deleted, just not the near-term target.
- [x] **Phase 3**: wired into the real app — `electron/src/main/worldEngine.ts`
  spawns/tracks the Phase 1 binary as a child process (mirrors `pty.ts`'s
  own spawn/dispose shape), a "World Engine → Launch World Engine (dev)"
  application-menu item triggers it, disposed on `before-quit`.
  typecheck/250-test suite pass; binary-path resolution verified against
  the actual build artifact. Dev-only — packaging the binary via
  `electron-builder` for a real release is real follow-up work. Live
  click-through from inside the running app is pending the user's own
  check (this session doesn't launch the live app itself).
- Phase 4 (input forwarding) is **not needed** for the shape actually
  shipped — that was only a Phase 2 (in-process embed) problem.

Full detail, including why 2D/3D/Video/CAD panes (Blender/Krita/etc.)
stay on the *fork the real app, don't reimplement* principle — World
Engine is the one deliberate exception, and even it now hosts the same
"separate process, not embedded" way — in
[09-future-native-architecture.md](./architecture/09-future-native-architecture.md#world-engine-build-out--phase-1-4-2026-08-28)
and [ideation.md](./ideation.md#그래픽cad-pane을-실제로-만들-때의-원칙--외부-오픈소스-엔진-forkembed).

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
