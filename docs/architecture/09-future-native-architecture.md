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
framing), or a truly remote/cloud-rendered source. For Workspace's *own*
engine, co-located and fully trusted, local IPC is simpler, faster, more
secure, and more conservative — on every axis the user has asked this
architecture to optimize for. `native/world-engine-core/`'s next
integration pass should swap its transport to local IPC before (not
instead of) wiring into Electron; `engine-stream-poc/` stays as-is,
correctly scoped to the Track B problem it was actually built for.

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
