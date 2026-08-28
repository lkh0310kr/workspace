# Future native architecture (long-term, not designed yet)

**Status:** Reference direction only. Nothing here is scheduled, designed
in detail, or started. Captured so this context survives across sessions
(human or AI) — not just in one conversation's memory.

## Origin

Originally discussed while planning a Vector Editor pane, which was built
(M1-M6, hand-rolled SVG-DOM) and then deliberately deleted — not because
2D/graphics was the wrong direction, but because hand-rolling a 2D editor
from scratch was the wrong *strategy* at the scale now being targeted.
Current direction (see `docs/ideation.md`) is genuinely professional-grade
tooling in four categories — **2D** (Figma/Illustrator/Photoshop-class),
**3D** (Blender-class), **Video** (a real video editor), and
**Engineering** (CAD, Nvidia Omniverse-style USD pipelines, game
engines) — built by forking/embedding real open-source engines, not
reimplementing them. This doc's architecture direction is exactly the
"how do you host that inside/alongside an Electron shell" question for
all four. It came from an external discussion (not written with
knowledge of this codebase) and should be read as directional
inspiration, not a spec to implement literally.

## The direction

Electron stays as a **thin Workspace Shell** — window/pane management,
tabs/splits, command palette, file dialogs, app lifecycle, IPC. It does
*not* try to be the implementation technology for every pane forever.
Heavy graphics/compute work moves out as panes get more demanding:

- **In-process, still Electron**: a compute-heavy-but-still-UI pane (a
  binary/hex parser, a packet decoder, a physics/simulation engine) can
  move its core compute work into a **Rust core** (via native module /
  WASM), reached from the TypeScript UI over IPC or FFI, using **wgpu**
  for GPU rendering where relevant. The Electron renderer keeps the UI
  chrome (toolbar, panels, inspector, dialogs); Rust does the expensive
  part. This is *not* a rewrite of Electron itself — the Workspace shell
  stays TypeScript/React.
- **Out-of-process, Blender-class apps**: something like Blender is not
  meant to run inside an Electron renderer at all. It runs as a **separate
  native process**. Originally framed as "the pane hosts that process's
  rendering surface/window" — refined below (2026-08-28 research pass):
  "hosts a surface" turns out to mean *pixel-streamed into a Browser tab*
  in practice, not a true embedded native window (which research found no
  clean cross-platform path for at all).

## Unified hosting design (research pass, 2026-08-28) — no native window embedding needed so far

Prompted by: should "Game Engine" and "engineering simulation" stay separate
World Engine categories, and can *any* of them realistically be hosted by
truly embedding a native window inside Electron? Researched real
candidates (Bevy, MonoGame, NVIDIA Omniverse, FreeCAD/OpenCASCADE) instead
of guessing. Findings, each verified (websearch + cloning real repos into
`ref-proj/`, not assumed):

- **True native-window embedding is a dead end.** Electron's own tracker
  has three open, unresolved issues asking for this
  (`electron/electron#5083`, `#2326`, `#10547`) — no clean cross-platform
  path exists. The only known workaround is a raw OS-level native module
  doing window reparenting, and even that has real precedent only on
  Windows (MonoGame's `MonoGame.Framework.WpfInterop`/`MonoGame.Forms`
  hand a MonoGame `Game` a WPF/WinForms child surface instead of letting
  it own a top-level window) — nothing comparably proven exists for
  macOS, which is this app's actual dev platform.
- **Bevy isn't a native-embed case at all.** It has first-class WASM/WebGL
  (and WebGPU) export, same as Godot. It's a **web-bundle** candidate,
  reusing today's `workspace-engine://` pipeline unchanged.
- **FreeCAD/OpenCASCADE has real WASM ports too** (`magik.net/freecad` —
  third-party but functional: the full parametric-CAD desktop, kernel
  included, compiled to WASM; `OpenCascade.js` for building a lighter
  custom viewer). CAD may also fit the web-bundle track, not native-embed.
- **NVIDIA Omniverse's own answer is pixel-streaming, not embedding** — and
  it's genuinely relevant beyond Omniverse. Cloned and read
  `ref-proj/ovstream` (NVIDIA's streaming SDK) and
  `ref-proj/omniverse-web-viewer-sample`: a native/Kit app renders
  normally and pushes frames to `ovstream`, which encodes on-GPU (NVENC)
  and serves WebRTC (or RTSP/native/SHM); the browser side
  (`examples/webrtc_client/index.html`, read directly) is a **plain HTML/
  JS page using standard WebRTC APIs** — no special native integration on
  the client at all. The README states it plainly: "no Kit, no Carbonite,
  no Omniverse app required" — it's a general GPU-pixel-streaming SDK, not
  an Omniverse-only tool. **Caveat: ovstream itself is CUDA-only (NVIDIA
  GPU required) and NVIDIA-licensed, not MIT** — can't run on this app's
  own macOS dev machine and can't be shipped as-is. The *pattern* is
  reusable regardless: GStreamer's `webrtcbin`/`webrtcsink` (LGPL,
  cross-platform, builds on macOS) implements the same
  capture-encode-WebRTC pipeline without CUDA lock-in.

**The unifying design, then:** every World Engine pane, regardless of
which of the two tracks below backs it, ends at the exact same place —
**a URL opened in the existing Browser pane.** No third pane kind, no new
webview lifecycle code, ever — that integration point is already built
and stable.

```
Engine picked
  ├─ Has a real WASM/web export? ──────► Track A: web-bundle (built, verified)
  │                                        export → workspace-engine:// → Browser tab
  └─ No web export (Omniverse-class,  ──► Track B: pixel-streaming (designed, not built)
     production CAD, MonoGame, etc.)      spawn native process → Rust sidecar
                                           captures/encodes/serves WebRTC → Browser tab
```

**Track A is always the default — exhaust it before ever reaching for
Track B.** It's already built, already verified end-to-end, has zero new
native dependencies, and every researched candidate so far (Godot, Bevy,
FreeCAD) fit it. Track B only gets built the first time a real, concrete
engine choice genuinely has no web-export path — not speculatively ahead
of that.

### Track B revision (2026-08-28) — stability/performance first, Rust sidecar instead of GStreamer-in-main

The GStreamer sketch above was the *pattern*, not the actual pick.
Revisited with this app's real priorities (stability, performance,
conservative choices, cross-platform compatibility) — GStreamer itself is
the wrong fit for a *shipped* Electron app: its native dependency surface
is large and notoriously fragile to bundle correctly per-platform (many
dynamically-loaded plugin `.so`/`.dylib`/`.dll` files, a mixed
LGPL/GPL plugin landscape that needs real license auditing before
shipping), which cuts directly against "탄탄하게/보수적으로."

**Revised design: a standalone Rust sidecar process**, not a GStreamer
pipeline glued into the main process — consistent with this doc's own
"[if a Rust core ever happens, keep it a real core, not an Electron
helper](#if-a-rust-core-ever-happens-keep-it-a-real-core-not-an-electron-helper)"
principle already stated below, and a better fit on every axis the user
asked for:

1. **WebRTC transport**: [`webrtc-rs`](https://github.com/webrtc-rs/webrtc)
   — a pure-Rust WebRTC implementation (MIT/Apache-2.0, no C/GStreamer
   dependency tree at all). Compiles into one small static binary per
   platform instead of a sprawling shared-library install — far easier to
   ship reliably, and matches "호환성 높게" much better than depending on
   a system or bundled GStreamer install.
2. **Video encode — hardware-accelerated, not software, for
   performance**: platform-native hardware encoders only (VideoToolbox on
   macOS, NVENC on Windows/NVIDIA, VAAPI/QuickSync on Linux/Intel) via
   Rust FFI bindings. Software x264 as a last-resort compatibility
   fallback only (a GPU without any hardware encoder) — never the primary
   path, since software-encoding would compete with the engine's own
   rendering for the same CPU/GPU budget and defeat the performance goal.
3. **Raw-frame handoff, engine → sidecar**: shared memory (SHM), not a
   socket — zero-copy, same-machine, matches `ovstream`'s own SHM
   transport (a proven pattern for exactly this handoff, not a novel
   idea). Best case the engine offers its own offscreen/headless render
   target directly (no OS window capture needed, e.g. how Omniverse Kit
   apps feed `ovstream`); worst case (no offscreen mode) it's real
   window/screen capture — slower, and on macOS triggers the
   screen-recording permission prompt, so this is a real per-engine
   compatibility question to check *before* committing to a candidate,
   not after.
4. **Serving the client page**: same shape as `workspace-engine://` — a
   custom protocol or a `127.0.0.1:<port>` page serving a generic WebRTC
   client (styled after `ovstream`'s example, but a genuinely from-scratch
   page — `ovstream`'s own client is NVIDIA-licensed).
5. **Unsolved, still the actual hard part**: routing mouse/keyboard input
   from the browser-side WebRTC data channel back into the native
   process. `ovstream` gets this for free (`callbacks and messaging
   APIs`); the Rust sidecar doesn't, and needs real design once a
   concrete engine forces the question — likely synthetic OS input
   injection (platform-specific, its own compatibility research) or,
   better where available, an engine-level input API instead of faking
   OS events.

Given every researched candidate has *either* a web-export path *or* a
documented streaming precedent, true native-window embedding may never
actually be needed — kept only as a last-resort idea, not designed
further unless a real future candidate proves to require it.

### Feasibility spike — the core chain actually works (2026-08-28)

Built and verified `native/engine-stream-poc/` (standalone Cargo project,
no Electron involvement — see its own comments for what it deliberately
doesn't cover: no real engine, no hardware encoder, no input round-trip).
**Result: it works.** A Rust process generates synthetic animated frames,
encodes them with `openh264` (software, as planned for this first spike),
and streams them over a real WebRTC connection (`webrtc-rs` 0.20.3) to a
real client — verified with a genuine WebRTC peer (Python's `aiortc`, not
a mock), which received and decoded 5 real video frames at the correct
640×360 resolution and ~33ms (30fps) spacing. Browser-based verification
via an automated Chrome tool was attempted but blocked by a network
boundary between that tool's browser and this machine's `127.0.0.1` (not
a code or design problem — confirmed the same tool loads public sites
fine, just can't reach this loopback address); `aiortc` gave an equally
real, arguably more precise proof (frame dimensions + timing asserted
programmatically, not just "video visually plays").

**One real bug found and fixed in the process** (not merely "it compiled
and looked right" — an actual runtime failure caught by testing against a
real WebRTC peer): the RTP payload type used to write samples was read
via `sender.get_parameters()` immediately after `add_track()`, before SDP
negotiation happened — at that point it only reflects this sender's own
pre-negotiation default, not what offer/answer actually settled on. The
remote peer's offer proposed a different payload-type number for the same
codec (101 vs. this sender's own default of 102); every frame sent with
the wrong PT was silently rejected receiver-side with *no error surfaced
on the sending side at all* — zero frames arrived, and nothing about the
Rust process's own logs looked wrong until `RUST_LOG` was wired in and
turned up. Fixed by reading the negotiated payload type only after
`set_local_description`/ICE-gathering-complete, not right after
`add_track()`. Worth remembering for the real Track B build later: codec
parameter negotiation results aren't necessarily available until
negotiation actually finishes, even though the API doesn't obviously
signal that ordering requirement.

**What this proves, and what it doesn't**: proves the transport mechanism
(Rust → H.264 encode → WebRTC → real browser-grade client) is real and
implementable on this exact machine with mainstream, actively-maintained
crates, not just plausible on paper. Doesn't yet prove: capturing an
actual engine's frames (still synthetic here), hardware encoding
(VideoToolbox — still the stated follow-up), or the input round-trip
(still the open question). Those stay real next increments, not done by
this spike.

### Correction — "World Engine" means building one, not hosting one (2026-08-28)

Everything above (Track A/B, `engine-stream-poc`) answers "how do we
*host* a third-party engine's output inside a Workspace pane." The user
clarified that isn't what "World Engine" is meant to be — Workspace
should have **its own real engine**, assembled from proven open-source
Rust libraries as components (rendering, physics, ECS), the way any real
engine (Bevy included) is actually built — not embedding/streaming
Godot/Omniverse/etc. as a black box. Everything above stays true and
useful (it's still the right way to host a *third-party* renderer if one
is ever needed for something Workspace's own engine doesn't cover), but
it answers a different question than "World Engine" turned out to mean.

**v0 built and verified**: `native/world-engine-core/` — a second
standalone Rust binary (alongside `engine-stream-poc/`, not merged into
it) that is a real, if minimal, engine: `wgpu` for offscreen GPU
rendering, `rapier3d` for physics, `hecs` for ECS state, composed into one
process, reusing `engine-stream-poc`'s already-proven WebRTC transport to
show its output. One hardcoded cube, dropped and bounced under real
gravity, with a basic single-light shader.

Verified for real, with actual visual proof, not just "compiles and
starts": captured 60 real decoded frames via a genuine WebRTC client
(`aiortc`) and inspected them as images. The cube visibly falls into
frame and visibly rotates between captures — different faces (colors)
visible at different timestamps, matching independently-logged rigid-body
translation that decreased frame over frame exactly as gravity would
predict. Confirms Rapier is genuinely driving what wgpu renders, not a
scripted animation.

**One real debugging lesson, not a code bug**: the cube was initially
invisible in every captured frame (identical brightness across 20
frames). Diagnosed methodically rather than guessing: disabling backface
culling changed nothing (ruled out a winding-order bug); rendering with
an identity transform instead of the physics-driven one *did* render a
visible cube (proved the render pipeline itself was correct); logging the
actual computed model matrix each frame showed the translation's Y
component decreasing exactly as expected for gravity (proved physics was
correct too). The actual cause: the cube started at y=6 and the fixed
camera's 45° vertical FOV only covered roughly y∈[−2.3, 2.3] at that
viewing distance — it was simply above the frustum for the entire
captured window, nothing was ever wrong with the code. Fixed by lowering
the drop start (y=6 → y=2.5) and widening the camera's framing margin —
worth remembering: "nothing renders" during physics/render integration
work is camera framing at least as often as it's a pipeline bug, and
isolating render-correctness from simulation-correctness independently
(the identity-matrix test) finds that fast.

**Still not done** (real next increments, same shape as `engine-stream-poc`'s
own list): more than one entity/a real scene graph, asset loading (this
cube is hardcoded geometry), materials/shadows beyond one flat light,
hardware video encoding, input round-trip, and any Electron/Workspace
wiring at all — this is still a fully standalone proof, not integrated
into the app.

### Transport critique — WebRTC was the wrong choice for our own engine (2026-08-28)

`world-engine-core` reused `engine-stream-poc`'s WebRTC transport without
re-examining whether it still made sense once the thing being streamed
changed from "a third party's black-box output" to "our own engine,
co-located on the same machine, both ends under our control." It doesn't.

WebRTC exists to solve problems this pairing doesn't have: NAT traversal
(ICE/STUN/TURN), untrusted/adversarial network links, encryption for
public-internet transport (DTLS-SRTP), a browser's cross-origin security
model. None apply to a Rust process this app itself spawns, talking to
this app's own main process, on the same machine. What it actually cost,
concretely, not hypothetically:

- **Lossy video compression** (H.264) for a same-machine pipe with no
  bandwidth constraint at all — pure encode latency and quality loss for
  nothing gained.
- **A real ICE negotiation handshake** (hundreds of ms of setup) to
  connect two processes that are already related by `spawn()`.
- **The payload-type negotiation bug hit and fixed today** — that failure
  mode exists *only* because of WebRTC's offer/answer negotiation model;
  it has nothing to do with the actual problem ("get pixels from process A
  to process B").
- **An actual open UDP port**, even bound to `127.0.0.1` — needless attack
  surface for a pipe that should be exactly as exposed as `stdin`/`stdout`.

**The right answer is already proven elsewhere in this exact codebase**:
the terminal solves the identical shape of problem — a spawned native
process's output needs to reach the renderer — via `Pty` → `PtySession` →
IPC → `xterm.js`. No compression, no negotiation, no network stack, just
a byte stream the main process reads and forwards. World Engine's own
integration should follow the same shape once it's actually wired into
Electron:

```
world-engine-core (spawned by main, like Pty)
  → raw/lightly-compressed frames over a local pipe (stdout, a Unix
    domain socket, or a shared-memory ring buffer — pick the simplest
    one that meets perf needs, don't pre-optimize)
  → main process reads, forwards via IPC (mirrors PtySession's data
    forwarding)
  → renderer draws to a <canvas> (ImageBitmap / WebGL texture upload,
    not a <video> element — there's no video, just frames)
```

Input goes back the same direction, reusing the same channel — no
synthetic-OS-input-injection problem to solve either, since the renderer
can send structured input events directly to the spawned process over the
same local IPC, the same way terminal keystrokes already reach the PTY.

**WebRTC/Track B is not wasted work — it answers a genuinely different
question.** Keep it for the case it actually fits: hosting a *third-party*
engine that must present as "just a URL" (the original Track A/B
framing), or a truly remote/cloud-rendered source. `engine-stream-poc/`
stays as-is, correctly scoped to the Track B problem it was actually
built for.

### Even better than local IPC + canvas: render directly into a native embedded view (2026-08-28)

The local-IPC-plus-`<canvas>` design above (this doc's first correction
pass) is a real improvement over WebRTC, but it's still not what "네이티브
급으로, 완전히 다를 게 없어야 해" (native-grade, indistinguishable) actually
demands: it still round-trips every frame through a CPU readback (wgpu
texture → CPU buffer → IPC → JS draws to canvas). That's real work per
frame a genuinely native app never does.

Researched further and found the actually-correct answer, verified via a
real, working, documented implementation — not assumed:
[monkeynut.org's "Using wgpu with Electron on macOS"](https://www.monkeynut.org/wgpu-electron/).
The technique: Electron already exposes
[`getNativeWindowHandle()`](https://www.electronjs.org/docs/latest/api/browser-window#wingetnativewindowhandle),
returning the real platform window handle (an `NSWindow*` on macOS). A
native Rust addon (built with [`napi-rs`](https://napi.rs/), a mature,
widely-used Node native-module framework) takes that handle, creates its
**own** `NSView` subclass (not someone else's window — a view *we*
create and fully control), adds it as a subview of Electron's content
view (positioned below Electron's own web layer, which is set fully
transparent — `background: #00000000` — so the native view shows through
seams-free), and builds a `wgpu` surface directly from that subview via
[`raw-window-handle`](https://github.com/rust-windowing/raw-window-handle)
(the same crate `winit`/`wgpu` use internally — MSRV 1.85, actively
maintained). `wgpu`'s Metal backend then presents **directly** to that
native surface every frame — no CPU readback, no IPC frame transfer, no
`<canvas>` draw calls. This is genuinely the same rendering path any
native macOS app uses; the only difference from a standalone app is that
the `NSView` happens to be a child of an Electron-owned window instead of
owning its own top-level window.

This directly refines this doc's own earlier, more pessimistic
conclusion ("true native-window embedding has no clean cross-platform
path") — that research was about embedding *someone else's* already-
existing window (Notepad, another app's process) into Electron, which
really is unsolved (the cited open Electron issues are about exactly
that). Embedding a **new native view we create ourselves**, driven by our
own renderer, is a different and much more tractable problem, with a
real working reference implementation.

**Cross-platform story**: `raw-window-handle` itself supports Windows
(`HWND`) and Linux (X11/Wayland surfaces) too, not just macOS — and the
Windows shape is exactly `MonoGame.Framework.WpfInterop`'s already-cited
precedent (`SetParent` + a child `HWND`, a decades-old, thoroughly proven
Win32 technique). macOS is the best-verified case right now (one real
reference implementation read in full); Windows should work via the same
crate but hasn't been checked against a concrete example the way macOS
has; Linux is the least explored of the three.

**The one real open question, genuinely unsolved so far**: input.
Electron's transparent web layer sits *in front of* the native view in
the composited window, and by default would still intercept mouse/
keyboard events meant for the native content underneath. This project
already has real, working infrastructure for a closely related problem —
`InteractionCoordinator` (`04-interaction-coordinator.md`) manages
exactly this kind of "let input reach embedded content, not the DOM
overlay on top of it" for `<webview>` panes (pointer-events toggling,
overlay stack). Whether that same mechanism (or something in its family —
`setIgnoreMouseEvents`-style pass-through, or routing input to the native
view directly at the OS level) extends cleanly to a native `NSView`/
`HWND` sibling instead of a DOM element is the concrete next research
question — not yet answered, flagged here rather than guessed at.

**Revised verdict**: this native-embed path supersedes the local-IPC-
plus-canvas design above for World Engine's real Electron integration —
strictly better on the performance/native-fidelity axis the user is
actually optimizing for, at the cost of needing a native Node addon
(`napi-rs`) as new build/packaging surface this app doesn't have yet
(Electron's own docs cover exactly this — see "Native Code and Electron:
Objective-C/Swift (macOS)" and the Windows/C++ equivalent). Local IPC (the
previous section) stays as a documented fallback if the native-embed
input problem turns out to be genuinely unsolvable — not deleted, just
demoted to "plan B."

### World Engine build-out — Phase 1-4 (2026-08-28)

Concrete phases toward real Electron integration, defined after the user
asked to see this through rather than stop at "designed, not built":

- **Phase 1 — DONE, verified.** `native/world-engine-qt-shell/`: Qt
  (native, cross-platform UI toolkit — the "정석"/canonical choice for
  Blender/Unity-grade tools, confirmed by researching what Blender/Unity/
  Unreal/DaVinci Resolve actually use, none of them web-based) creates a
  real native window; `wgpu` renders directly into it (no readback, no
  IPC) using the same physics-driven cube as `world-engine-core`
  (`rapier3d` + `hecs`). Standalone process, own top-level window — not
  embedded in Electron yet. Live-verified: a real macOS window with the
  falling/bouncing cube, confirmed on-screen by the user directly (no
  browser client needed this time, unlike the WebRTC-based spikes).
- **Phase 2 — DONE, verified.** `native/world-engine-electron-embed/`: a
  native Node addon (`napi-rs`), loaded directly into a real Electron
  process (not Qt this time — Qt was for Phase 1's standalone-app
  question; true in-process pane embedding doesn't need Qt's own window
  layer at all). Takes Electron's `getNativeWindowHandle()`, creates our
  own `NSView` (via `objc2`/`objc2-app-kit`) as a subview of Electron's
  content view, and `wgpu` renders directly into it from a dedicated
  render thread — in-process, zero IPC frame transfer, zero video.
  Verified against a real (throwaway, not the Workspace app itself)
  Electron process: the addon loads, embeds, and renders continuously
  with no crash. Reference implementation followed closely (not
  guessed): [monkeynut.org's "Using wgpu with Electron on macOS"](https://www.monkeynut.org/wgpu-electron/),
  which supplied the exact `objc2`/`napi-rs` call shapes used here.
- **Pivot after Phase 2 (2026-08-28): decoupled, not embedded.** Phase 2
  proved true in-process embedding *works*, but its Phase 4 follow-up
  (input forwarding through Electron's transparent web layer into a
  native `NSView` sibling) has no reference implementation anywhere —
  genuinely unsolved, open-ended research risk. Asked directly: "그냥
  일렉트론이랑 앱을 분리할까?" User agreed to decouple rather than absorb
  that risk. World Engine runs as its **own separate native window**,
  which Workspace spawns and manages — the same shape as this app's own
  itch.io-inspired precedent for native content (spawn it, track its
  lifecycle, don't try to visually embed), and the terminal's own
  `Pty`/`PtySession` pattern (main process owns a child process's
  lifecycle) applied to a GUI process instead of a shell. This has **zero
  input-forwarding problem at all** — Phase 1's Qt window already handles
  mouse/keyboard entirely natively, since it's a real, independent native
  window. Phase 2's in-process embedding isn't deleted — kept as a proven,
  documented option to revisit if a genuinely seamless embedded pane
  becomes worth the unsolved input-routing risk later — but it's no
  longer the near-term integration target.
- **Phase 3 — DONE.** Wired into the real Workspace app, matching the
  decoupled shape: `electron/src/main/worldEngine.ts` spawns/tracks
  `world-engine-qt-shell` as a child process (`launchWorldEngine`/
  `stopWorldEngine`/`worldEngineStatus`, mirroring `pty.ts`'s own
  spawn/dispose shape), disposed on `before-quit` alongside the terminal's
  own cleanup. Triggered via a new "World Engine → Launch World Engine
  (dev)" application-menu item (`index.ts`) — dev-only for now, matching
  `resolveWorldEngineBinary()` pointing at the debug build under
  `native/world-engine-qt-shell/target/debug/`; packaging the compiled
  binary via `electron-builder` for a real release is real follow-up work,
  not attempted here. `npm run typecheck` and the 250-test suite both
  pass; the binary-path resolution was verified to match the actual built
  artifact's location. **Live click-through confirmed by the user** —
  the app menu item opens a real World Engine window from inside the
  actual running Workspace app.
- **Phase 4 — not needed for the decoupled shape.** Input forwarding was
  only a problem for Phase 2's in-process embedding; a separately-managed
  native window (the shape actually shipped) has no such problem. Stays
  recorded above as a real option if embedding is revisited later, not as
  outstanding work blocking anything today.
- **Phase 5 — DONE: real project integration ("실제 프로젝트 연동").**
  World Engine can now load a real scene instead of always showing the
  same hardcoded demo cube. `world-engine-qt-shell` accepts an optional
  first CLI arg (a project directory) and reads `world-engine.json` from
  it — a deliberately minimal scene format (a flat list of cubes, each an
  independent dynamic rigid body with position/rotation/restitution/
  color; no meshes, no assets, no scripting — real future scope, not this
  pass) parsed with `serde`/`serde_json`. `World` now holds a `Vec` of
  entities instead of one, and `render_frame` draws each with its own
  model matrix and tint (one draw call + submit per entity — simplest
  correct thing at this scale, not a dynamic-offset uniform buffer).
  TreeView gates a new "Open in World Engine" context-menu item on the
  presence of `world-engine.json` in a folder's loaded children — the
  exact same pattern as `project.godot`'s gating for "Export Godot (Web)
  & Open." Wired through `worldEngine:launch` IPC →
  `workspace.launchWorldEngine(tabId, rel)` (resolves through
  `files.resolveUnderRoot`, same confinement every other file op here
  uses) → `worldEngine.ts`'s `launchWorldEngine(projectPath)`, now
  spawning a *new* window per call (tracked in a `Set`, not a single
  slot) since different projects are genuinely different windows.
  Live-verified directly (not just typecheck): built a real 3-cube test
  fixture (`electron/test-fixtures/world-engine-demo/world-engine.json`,
  different positions/restitution/colors) and ran the binary against it
  standalone — logged "3 entities" loaded, real window, no crash; also
  regression-checked the no-argument path still logs "1 entities" and
  behaves exactly as the original single-cube demo. `npm run typecheck`
  and the 250-test suite pass after the IPC/TreeView/PaneGroup wiring.

Phases 1 and 2 each stayed intentionally scoped to *proving the
mechanism* before either touched `electron/` — matching this session's
own established pattern (the transport spike, the physics/render spike
before it). Phase 3 is real integration, using Phase 1's artifact (the
Qt window) rather than Phase 2's (the in-process embed) — the safer,
fully-solved path once the two were compared honestly. Phase 5 is the
first real content the integration actually hosts, not just a demo.

### Phase 6 — DONE: real camera input (2026-08-28)

Confirmed feasibility of the fork/spawn pattern for other categories
first: installed real Blender via Homebrew cask and spawned it as a
plain child process (`Blender.app/Contents/MacOS/Blender`, no args) —
a genuine window opened, same as `world-engine-qt-shell`'s own window,
confirming the exact pattern already shipped for World Engine
generalizes directly to real professional GPL tools (Blender/Krita) with
zero new engineering risk. 2D's story is different and simpler still:
Penpot is MIT and already web-based, so it likely fits the
already-solved Track A (web-bundle/Browser-pane) path rather than
needing the fork/spawn pattern at all — not built, just noted as the
right next check whenever 2D is actually picked up.

Then deepened World Engine itself, per the user's own priority. Added
real orbit-camera controls — drag to rotate, scroll to zoom — which
needed no `InteractionCoordinator`-style overlay/pointer-events work at
all, since `world-engine-qt-shell` is a genuine independent native
window: Qt already receives real mouse/wheel events natively.
`cpp/shim.cpp` gained an `EngineWidget` (a plain `QWidget` subclass
overriding `mousePressEvent`/`mouseMoveEvent`/`mouseReleaseEvent`/
`wheelEvent` — overriding existing virtuals needs no `Q_OBJECT`/`moc`,
keeping Phase 1's "no moc" simplicity) forwarding real input events
through a new `InputCallback` in `shim.h`. Rust's `Camera` (yaw/pitch/
distance, orbiting the scene origin) is updated from those events and
used to compute the view matrix every frame instead of a fixed eye
position. Verified: builds clean, runs against the 3-cube test fixture
with no crash. **Confirmed live by the user** — drag orbits, scroll
zooms, inside the actual running window.

### Phase 7 — DONE: ground plane + real glTF mesh loading (2026-08-28)

Two more deepening items, same session: entities had nothing visible to
show what they were physically landing on (the ground collider existed
in `rapier3d` but was never rendered) — added a flat quad matching the
collider's actual size/position (`ground_geometry()`), drawn first each
frame before the entity loop.

Then real mesh loading: an optional top-level `"mesh"` field in
`world-engine.json` (a path relative to the project directory, `.gltf`
or `.glb`) replaces the built-in cube for every entity in that scene.
`load_mesh()` uses the `gltf` crate's standard reader pattern
(`gltf::import` → first mesh → first primitive → `reader.read_positions
()`/`read_normals()`/`read_indices()`) — positions/normals/indices only,
no materials/textures/skinning/animation (real future scope). A missing
or broken mesh reference logs a warning and falls back to the cube
rather than crashing. `GpuContext` was refactored to hold two independent
`Mesh` records (ground, entity) instead of one hardcoded cube buffer, via
a new `upload_mesh()` helper shared by both.

Live-verified directly: built a real two-box test fixture
(`electron/test-fixtures/world-engine-mesh-demo/`, referencing a real
`.glb` — the official glTF-Sample-Assets "Box" model, a small CC0/public-
domain test asset bundled with the `gltf` crate's own repo) and ran the
binary against it standalone — no fallback-to-cube warning printed
(meaning the real mesh loaded), 2 entities, no crash. Regression-checked
the earlier cube-only scenes (default single-cube demo, the 3-cube
fixture) still behave identically after the `GpuContext` refactor.

Live QA of Phase 7 (user looking at the actual window) caught two real
bugs, both fixed the same session:

- **Ground plane invisible from above**: `ground_geometry()`'s original
  triangle winding produced a normal facing `-Y`, which is front-facing
  (visible, per the render pipeline's `cull_mode: Some(Face::Back)`) only
  from *below* the plane. Diagnosed by hand via the
  `(v1-v0)×(v2-v0)` cross-product for the first triangle, confirmed the
  direction, reversed the index order (`[0,1,2,2,3,0]` →
  `[0,2,1,2,0,3]`), re-verified the new winding's normal points `+Y`.
- **Camera drag direction inverted on a real macOS trackpad**: `yaw -=
  dx * ORBIT_SPEED` felt backwards — dragging right orbited the "wrong"
  way. Flipped to `yaw += dx * ORBIT_SPEED`.

Both were found only by the user actually looking at the running window
— exactly the kind of bug this build-out's "verify at each step, don't
build blind" approach is for.

### Phase 8 — DONE: real rapier3d feature exposure — body types, shapes, mesh-fit colliders (2026-08-28)

`rapier3d` was already a complete physics engine underneath (the same
one Bevy wraps rather than reimplementing), but the scene format only
ever exposed a single dynamic-body, hardcoded-0.5-cuboid slice of it.
This batch exposes three more real capabilities, all backward-compatible
(every existing `world-engine.json` fixture keeps parsing and behaving
identically with zero changes):

- **Body types**: an optional `body_type` field (`"dynamic"` default,
  `"fixed"`, `"kinematic"`) maps directly to `RigidBodyBuilder::dynamic()`
  / `::fixed()` / `::kinematic_position_based()`. Kinematic is a real,
  distinct rapier3d body type — nothing drives its position frame-to-
  frame yet (scripted motion is real future scope), so it currently reads
  as visually identical to fixed.
- **Collider shapes**: an optional `shape` field (`"cuboid"` default with
  `half_extents`, or `"sphere"` with `radius`) maps to
  `ColliderBuilder::cuboid(...)` / `::ball(radius)`, each rendered with
  its own real mesh (`sphere_geometry()` — a small procedural UV sphere,
  LearnOpenGL's standard lat/long formula, deliberately reused rather
  than re-derived by hand after the ground-plane winding bug) instead of
  every shape rendering as a cube regardless of its actual collider.
- **Mesh-derived collider sizing** — the actual bug this batch fixes:
  Phase 7's loaded-mesh entities collided as a hardcoded tiny 0.5 cuboid
  no matter how large the real mesh was. `load_mesh()` now also computes
  the mesh's AABB from its raw vertex positions (min/max per axis) and
  returns it; `main()` passes it through as every entity's real collider
  half-extents when the scene has a top-level `mesh`, ignoring
  per-entity `shape` in that case (documented, not silently wrong).

Implementation note: a `shape` field was first tried as a proper
`#[serde(tag = "shape")]` internally-tagged enum, which is the more
idiomatic serde shape — but that combination doesn't degrade gracefully
when the tag key is entirely absent (every existing fixture has no
`"shape"` key at all; `#[serde(default)]` doesn't rescue it). Caught
during writing, before a build was even attempted — switched to plain
`Option<String>`/`Option<[f32;3]>`/`Option<f32>` fields plus a manual
`resolved_shape()` method that does the defaulting explicitly.

Verified the same way as every other phase: `cargo build` clean, no
warnings. New fixture
`electron/test-fixtures/world-engine-physics-demo/` (one fixed cuboid,
one dynamic sphere, one kinematic cuboid) run standalone — logs 3
entities, no crash. Regression-ran the three existing fixtures (default
single-cube demo: 1 entity; `world-engine-demo`: 3 entities;
`world-engine-mesh-demo`: 2 entities) — identical counts, no crash, mesh
fixture's collider now sized from the real loaded mesh instead of the
old hardcoded cuboid. Visual confirmation (does the sphere actually
render/bounce as a sphere, does the fixed body stay put, does the
kinematic body stay put) is the user's own live check, same as every
other rendering/physics-feel verification this arc.

### Phase 9 — DONE: real rapier3d joints + scripted kinematic motion (2026-08-28)

Closes the two explicit non-goals Phase 8 called out: joints and driven
kinematic bodies.

- **Joints**: a new top-level `"joints"` list in `world-engine.json`
  connects two entities (by 0-based index into `entities`) with a real
  `rapier3d` constraint — `"revolute"` (hinge, locks all relative motion
  except rotation around one axis — a door hinge/pendulum) and `"fixed"`
  (welds two bodies together, zero relative motion). Both map directly
  to `RevoluteJointBuilder`/`FixedJointBuilder` → `ImpulseJointSet::
  insert()`, which already existed in `World` (`impulse_joint_set` was a
  real field since Phase 1, just never had anything inserted into it).
  An out-of-range `body1`/`body2` index logs a warning and is skipped,
  matching the existing broken-mesh-reference pattern rather than
  crashing.
- **Scripted kinematic motion**: an optional `motion` field on a
  `"kinematic"` entity (`axis`/`amplitude`/`speed`) drives it via a new
  `Motion` ECS component and `World`'s own running clock
  (`time: f32`, advanced once per `step()` by `integration_parameters
  .dt`), calling `set_next_kinematic_translation` before the physics
  step each frame — sinusoidal only (`origin + axis.normalize() *
  amplitude * sin(time * speed)`), not a general animation system.
  Because it's driven through the real rapier3d kinematic-body API
  (not just moving the render transform directly), dynamic bodies
  resting on a moving kinematic platform get pushed by the solver
  correctly, not just visually overlapping it.

`SceneFile.joints` is brand-new data no existing fixture has, so —
unlike `SceneEntityDef`'s `shape` field (see Phase 8's implementation
note) — a plain `#[serde(tag = "type")]` internally-tagged enum works
fine here with no missing-tag problem to work around; there's no old
data for the tag to be missing from.

Verified the same way as every other phase: `cargo build` clean, no
warnings. New fixture
`electron/test-fixtures/world-engine-joints-demo/` — a revolute-joint
pendulum (fixed anchor + dynamic sphere, offset anchor for a lever arm)
plus a kinematic platform oscillating vertically with a dynamic cuboid
dropped onto it — run standalone: logs 4 entities, no crash, no
out-of-range-joint warning. Regression-ran all four other fixtures
(default single-cube, `world-engine-demo`, `world-engine-mesh-demo`,
`world-engine-physics-demo`) — identical entity counts, no crash.
Visual confirmation (does the pendulum actually swing under gravity
around its hinge, does the platform visibly oscillate, does the dropped
cuboid get carried/pushed by it) is the user's own live check.

### Phase 10 — DONE: engine core extracted as a library + a code-facing SDK API (2026-08-28)

Structural check-in after Phases 1-9: everything built so far was
genuinely a real engine (`wgpu` + `rapier3d` + `hecs`), but the whole
thing lived in one binary (`world-engine-qt-shell/src/main.rs`) driven
entirely by a static `world-engine.json` parsed once at startup and
interpreted by hardcoded rules. That's a JSON scene player, not the
target: a code-first engine SDK (write real Rust code against it to
build a game/simulation, Bevy-flavored) with an editor later as a
*secondary* tool for editing that code's data (closer to Bevy +
inspector than to GDScript-first Godot). Confirmed with the user this
session. Two real gaps, both closed by this phase:

**1. No reusable engine library existed.** `native/world-engine-core`
was the *old*, explicitly superseded WebRTC-transport spike — it
independently duplicated the same render/physics/ECS code
`world-engine-qt-shell` had, plus a pile of irrelevant deps (`tokio`,
`webrtc`, `warp`, `openh264`, `rtc`). `world-engine-electron-embed`
duplicated it a third time. Fixed by repurposing `world-engine-core`
entirely: its WebRTC-era `src/main.rs` and deps were replaced (not
patched) with the real engine code moved out of
`world-engine-qt-shell`, split into `render.rs` (wgpu, geometry, glTF
loading — genuinely Qt-independent, any future shell can reuse it),
`world.rs` (ECS/physics `World` + the new SDK surface), and `scene.rs`
(the `world-engine.json` loader). `world-engine-qt-shell` now depends on
it as a path dependency and shrank to just the Qt FFI glue + `Camera` +
CLI/project loading — its `Cargo.toml` dropped `wgpu`/`rapier3d`/
`hecs`/`raw-window-handle`/`gltf`/`serde`/`serde_json`/`pollster`/
`anyhow` entirely, down to `world-engine-core` (path dep) + `glam`.

**2. No code-facing hook existed at all.** Every behavior was
declarative JSON interpreted once at load time. Closed with a
**Rust-native trait/callback API** — `Behavior::update(&mut self, ctx:
&mut UpdateCtx)`, Bevy-system-flavored — chosen over embedding a
scripting language (Lua/Rhai/WASM), confirmed with the user: matches
this build-out's established low-risk-first pattern (verify each real
step, don't build the harder/riskier thing first), and a scripting
language can be layered on top of this API later without disturbing it,
whereas building the scripting layer first would be un-doable without
touching everything again. `World::spawn(EntitySpec) -> Entity` is now
the one real entity-creation entry point (both for hand-written game
code and for `scene::build_world`'s JSON loader, which is a thin loop
over the exact same `spawn`/`add_motion`/`add_joint` calls — not a
parallel hardcoded path). `World::spawn_with_behavior` attaches a
`Behavior`, run once per `step()` **before** the physics step (same
ordering scripted kinematic `Motion` already used) so anything it sets
on `ctx.rigid_body` — a force, an impulse, a kinematic target — is
consumed by that same step.

Implementation note: `hecs`'s `Component` bound requires `Send + Sync`
(for its parallel-iteration story), so `Behavior` needed `Send + Sync +
'static`, not just `'static` — found via a real compile error against
`Box<dyn Behavior>` as a component, not guessed at up front.

Verified as the actual point of this phase, not just that the refactor
compiles: `native/world-engine-core/examples/chase.rs` builds a `World`
**entirely in code** (no JSON, no window, no Qt) and steps it headless —
a `ChaseBehavior` moves a kinematic entity toward a fixed target every
frame via `UpdateCtx::rigid_body`, something the JSON format's
sinusoidal-only `motion` field cannot express. `cargo run --example
chase` prints the chaser's position converging step by step and asserts
it actually reaches the target (distance < 0.1) before printing success
— a real, falsifiable check that the `Behavior` hook drives genuine
rigid-body motion, not a silent no-op. Also: `cargo build` clean, no
warnings, in both crates; regression-ran all five existing
`world-engine-qt-shell` fixtures (default single-cube, `world-engine-
demo`, `world-engine-mesh-demo`, `world-engine-physics-demo`,
`world-engine-joints-demo`) standalone — identical entity counts, no
crash, confirming the split is behaviorally inert for every
JSON-declared scene. Visual re-confirmation in the actual Qt window is
the user's own live check, same as every other rendering/physics-feel
verification this arc.

Deliberately out of scope for this phase (real future work): scripting
language, hot-reload, an event bus, a query DSL beyond what `hecs`
itself gives you, multi-threaded systems, editor UI, save-back-to-JSON,
materials/lighting API, gameplay input routing.

## Per-pane stack direction (if/when this happens)

Reframed around the confirmed four-category graphics/CAD direction (see
`docs/ideation.md`) — none of these are designed yet, so this is a
starting hypothesis per category, not a decision:

| Pane | Status here | Stack direction |
|------|-------------|------------------|
| Terminal, Browser, Markdown/Code, Viewer, RSS | **Built**, plain TypeScript/React | No reason to move — these are UI/IO-bound, not compute-bound. Rust wouldn't win anything here. |
| 2D (Figma/Illustrator/Photoshop-class) | **Not started** | Likely candidate: fork Penpot (MIT, already TS/React-ish stack — closest fit to embed) or Krita (GPL, C++/Qt — would need out-of-process hosting). Verify against the real project before assuming either. |
| 3D (Blender-class) | **Not started** | Fork Blender itself, hosted as a **separate native process** per the out-of-process direction below — not an in-renderer engine. |
| Video Editor | **Not started** | Fork Shotcut or Kdenlive rather than wrapping FFmpeg from scratch; if built in-process instead, Rust-heavy timeline/media-graph/frame-scheduling engine wrapping FFmpeg (don't reimplement codecs), TS for timeline UI/media bin/inspector only. |
| Engineering (CAD, Omniverse-style, Game Engine) | **Not started** | CAD: fork FreeCAD (LGPL) or embed Open CASCADE directly. Game Engine: fork Godot (MIT). Omniverse-style (USD pipelines): no clear single fork target yet — needs its own research pass. All likely out-of-process per Blender's reasoning below. |
| Engineering/analysis panes (Packet Analyzer, Hex/Binary Inspector, Robot Simulator, etc. — see `docs/ideation.md`) | **On hold**, deprioritized behind the graphics/CAD direction | Not being designed right now; revisit later. |

## Why this doesn't block anything happening now

`PaneKindDefinition.render(ctx): ReactNode` (see
[`paneKindRegistry.ts`](../../electron/src/renderer/src/panes/paneKindRegistry.ts))
already doesn't assume "plain HTML div forever." A future GPU-backed
canvas pane, or a pane that hosts an external process's rendering surface,
is just a different kind's `render()` implementation — no rearchitecture
of the pane system is forced by building any given pane as plain HTML/SVG
today.

## What's deliberately *not* being designed yet

A "Pane Backend" abstraction with explicit surface types (something like
WebView Surface / Native Surface / External Window / GPU Surface) was
proposed as a way to formalize this ahead of time. **Not building it now**
— same principle as `paneKindRegistry.ts` itself (extracted after 6
concrete pane kinds existed, not designed speculatively before any of
them). Build it once a second real surface type actually exists (e.g. a
Rust/wgpu-backed pane, or a real external-process pane) and the
commonality is concrete, not hypothetical.

## If a Rust core ever happens: keep it a real core, not an Electron helper

The one structural point worth keeping even if everything else here
changes: if Rust is introduced, it should be a standalone core the
Electron shell *calls into*, not code that assumes Electron underneath it
— so switching the shell later (or shipping the core standalone) doesn't
require rewriting it. Sketch, not a commitment:

```
packages/
├── workspace-ui/        # TypeScript — current electron/src/renderer
├── workspace-runtime/    # TypeScript — current electron/src/main
├── core/
│   ├── media/            # Rust — timeline/frame scheduling wrapping FFmpeg (Video, if built)
│   ├── geometry/         # Rust — shared 2D/3D math (if forked engines need a common layer, unlikely — see the "don't merge engines" principle in ideation.md)
│   └── asset/            # Rust — shared project-file (de)serialization
└── apps/
    ├── 2d/                # hosts the forked 2D engine (Penpot/Krita/etc.)
    ├── 3d/                # hosts Blender as an out-of-process surface
    ├── video/
    └── engineering/       # CAD / game-engine / Omniverse-style, per what actually gets picked
```

This is **not** a restructuring to do now — `electron/` stays one package
until there's an actual second consumer of a Rust core (a real perf need,
not a hypothetical one). Recorded here so the shape is already agreed on
*if* that day comes, instead of re-litigating it then.

## When this becomes relevant

Revisit this doc when:
- A specific one of the four graphics/CAD categories actually gets
  picked up for real design work (see ROADMAP.md Phase 2) — that's when
  a real candidate engine's actual hosting/surface/GPU requirements
  should reshape this doc's guesses into an actual plan.
- A pane needs to host something that genuinely cannot run inside a
  Chromium renderer (near-certain for 3D/Blender-class and most of the
  Engineering category).

Until then, every pane in this app is a plain React component, same as
today.

## Related docs

- [07-future-phases.md](./07-future-phases.md) — near-term (not long-term) planned work
- [ideation.md](../ideation.md) — the engineering/analysis pane brainstorm that replaced Creative panes as the near-term direction
- [ROADMAP.md](../ROADMAP.md)
