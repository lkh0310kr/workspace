# 장기 네이티브 아키텍처 (아직 상세 설계 전)

**상태:** 참고 방향만 기록합니다. 이 문서 자체는 일정에 포함되지 않았고, 상세 설계나 구현도 시작하지 않았습니다. 검토한 방향을 다음 작업에서도 이어 볼 수 있도록 보관합니다.

## 배경

처음에는 Vector Editor pane을 계획하면서 논의했습니다. 해당 pane은 M1-M6 단계로 직접 SVG-DOM을 구현했지만 이후 의도적으로 삭제했습니다. 2D/그래픽이 잘못된 방향이어서가 아니라, 목표로 하는 규모에서 2D 편집기를 처음부터 직접 만드는 것이 잘못된 *전략*이었기 때문입니다.
이 메모를 작성할 당시 제안한 방향은 네 범주의 전문가용 도구였습니다. **2D** (Figma/Illustrator/Photoshop급), **3D** (Blender급), **Video** (실제 영상 편집기), **Engineering** (CAD, Nvidia Omniverse 스타일의 USD pipeline, game engine)입니다. 이를 다시 구현하는 대신 실제 오픈소스 엔진을 포크하거나 임베드합니다. 이 문서의 아키텍처는 네 범주 모두에 대해 "Electron shell 안이나 옆에서 어떻게 호스팅할까"라는 질문을 다룹니다. 이 방향은 외부 논의에서 비롯되어 이 코드베이스에 대한 지식 없이 작성되었으므로, 그대로 구현할 사양이 아니라 방향성 참고 자료로 읽어야 합니다.

## 방향

Electron은 window/pane 관리, tabs/splits, command palette, file dialogs, app lifecycle, IPC를 담당하는 **얇은 Workspace Shell**로 유지합니다. 모든 pane을 영원히 Electron으로 구현하려고 *하지 않습니다*. pane의 요구사항이 커질수록 무거운 graphics/compute 작업을 분리합니다.

- **In-process, 여전히 Electron**: binary/hex parser, packet decoder, physics/simulation engine처럼 계산량이 많지만 UI가 필요한 pane은 핵심 계산을 **Rust core**(native module / WASM)로 옮길 수 있습니다. TypeScript UI는 IPC 또는 FFI로 호출하고, 필요한 경우 GPU 렌더링에 **wgpu**를 사용합니다. Electron renderer는 toolbar, panel, inspector, dialog 같은 UI chrome을 유지하고 Rust가 비용이 큰 처리를 맡습니다. Electron 자체를 다시 작성하는 것이 아니며 Workspace shell은 계속 TypeScript/React로 유지합니다.
- **Out-of-process, Blender급 앱**: Blender 같은 앱은 Electron renderer 내부가 아니라 **별도 native process**로 실행합니다. 처음에는 "pane이 해당 프로세스의 렌더링 surface/window를 호스팅"한다고 표현했지만, 아래의 2026-08-28 조사에서 구체화했습니다. 실제로 "surface 호스팅"은 Browser tab으로 *pixel streaming*하는 것을 뜻하며, 조사 결과 깔끔한 cross-platform 구현 경로가 없었던 진짜 native window 임베딩을 뜻하지 않습니다.

## 통합 호스팅 설계 (2026-08-28 조사) — 현재까지 native window 임베딩 불필요

"Game Engine"과 "engineering simulation"을 별도의 World Engine 범주로 유지해야 할지, 그리고 native window를 Electron에 실제로 임베드해 어느 쪽이든 호스팅할 수 있을지에서 조사를 시작했습니다. 추측 대신 Bevy, MonoGame, NVIDIA Omniverse, FreeCAD/OpenCASCADE 후보를 조사했습니다. 각 내용은 websearch와 실제 repository를 `ref-proj/`에 clone해 검증했습니다.

- **진짜 native-window 임베딩은 막다른 길입니다.** Electron 자체 issue tracker에는 이를 요청하는 미해결 issue가 세 개 있습니다 (`apps/workspace/electron#5083`, `#2326`, `#10547`). 깔끔한 cross-platform 경로는 없습니다. 알려진 유일한 우회책은 OS 수준 native module에서 window reparenting을 수행하는 것입니다. 이마저도 Windows에서만 실제 선례가 있습니다(MonoGame의 `MonoGame.Framework.WpfInterop`/`MonoGame.Forms`는 MonoGame `Game`이 top-level window를 소유하는 대신 WPF/WinForms child surface를 사용하게 함). 실제 개발 플랫폼인 macOS에는 비슷하게 검증된 방식이 없습니다.
- **Bevy는 native 임베드 대상이 아닙니다.** Godot처럼 일급 WASM/WebGL 및 WebGPU export를 지원하므로, 현재 `workspace-engine://` pipeline을 그대로 재사용하는 **web-bundle** 후보입니다.
- **FreeCAD/OpenCASCADE에도 실제 WASM 포트가 있습니다** (`magik.net/freecad`는 타사 구현이지만 kernel을 포함한 전체 parametric-CAD desktop을 WASM으로 컴파일하며, `OpenCascade.js`는 더 가벼운 사용자 정의 viewer를 만들 때 사용). CAD 역시 native 임베드보다 web-bundle 경로에 적합할 수 있습니다.
- **NVIDIA Omniverse 자체가 제시하는 방식은 임베드가 아니라 pixel streaming**이며, 이는 Omniverse 외에도 적용할 수 있습니다. `ref-proj/ovstream` (NVIDIA streaming SDK) 및 `ref-proj/omniverse-web-viewer-sample`을 clone해 확인했습니다. native/Kit app은 일반적으로 렌더링한 뒤 frame을 `ovstream`으로 보내고, 여기서 GPU(NVENC) 인코딩 후 WebRTC(또는 RTSP/native/SHM)로 제공합니다. 브라우저 측(`examples/webrtc_client/index.html`을 직접 확인)은 **일반 WebRTC API를 사용하는 평범한 HTML/JS 페이지**라 client에 특별한 native 통합이 필요하지 않습니다. README는 "no Kit, no Carbonite, no Omniverse app required"라고 명시합니다. 즉 Omniverse 전용 도구가 아니라 일반 GPU pixel-streaming SDK입니다. **주의: ovstream 자체는 CUDA 전용(NVIDIA GPU 필요)이며 MIT가 아닌 NVIDIA license**이므로 이 앱의 macOS 개발 장비에서 실행할 수 없고 그대로 배포할 수도 없습니다. 다만 *패턴*은 재사용할 수 있습니다. GStreamer's `webrtcbin`/`webrtcsink` (LGPL, cross-platform, macOS에서 빌드 가능)는 CUDA에 종속되지 않고 같은 capture-encode-WebRTC pipeline을 구현합니다.

**따라서 통합 설계는 다음과 같습니다.** 어떤 track을 사용하는지와 관계없이 모든 World Engine pane은 동일한 지점, 즉 **기존 Browser pane에서 여는 URL**로 연결됩니다. 세 번째 pane 종류나 새 webview lifecycle code를 추가할 필요가 없습니다. 이 통합 지점은 이미 구현되어 안정적입니다.

```
Engine picked
  ├─ Has a real WASM/web export? ──────► Track A: web-bundle (built, verified)
  │                                        export → workspace-engine:// → Browser tab
  └─ No web export (Omniverse-class,  ──► Track B: pixel-streaming (designed, not built)
     production CAD, MonoGame, etc.)      spawn native process → Rust sidecar
                                           captures/encodes/serves WebRTC → Browser tab
```

**Track A를 항상 기본값으로 사용하고, Track B를 고려하기 전에 Track A를 충분히 검토합니다.** Track A는 이미 구현되어 end-to-end 검증을 마쳤고 새 native dependency가 없습니다. 지금까지 조사한 후보(Godot, Bevy, FreeCAD)도 모두 이 경로에 맞습니다. Track B는 실제 엔진 선택에 웹 export 경로가 없다는 점이 확인되는 경우에만 구현하며, 미리 추측해서 만들지 않습니다.

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

Built and verified a standalone Track B spike (formerly
`native/engine-stream-poc/`, now archived in
[`docs/research/track-b-webrtc-streaming.md`](../research/track-b-webrtc-streaming.md)
— no Electron involvement; no real engine, no hardware encoder, no input
round-trip).
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

**v0 built and verified**: `world-engine/core/` — a real, if
minimal, engine library: `wgpu` for GPU rendering, `rapier3d` for
physics, `hecs` for ECS state. One hardcoded cube, dropped and bounced
under real gravity, with a basic single-light shader. (An early v0 briefly
reused the Track B WebRTC transport to show output; that path was removed
once direct native rendering was proven — see transport critique below.)

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
question.** Keep the research for the case it actually fits: hosting a
*third-party* engine that must present as "just a URL" (the original
Track A/B framing), or a truly remote/cloud-rendered source. Findings are
archived in [`docs/research/track-b-webrtc-streaming.md`](../research/track-b-webrtc-streaming.md);
the spike crate was removed from the tree once qt-shell + embed paths
were chosen for Workspace's own engine.

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

## 구현 이력 (Phase 1–12)

독립형 Qt 실행, Electron 연동, 카메라 입력, glTF와 물리 기능, Core SDK 및 Rhai 스크립트까지의 상세 기록은 [World Engine 구현 이력](./world-engine-build-history.md)에 보관합니다. 현재 계약은 [World Engine 아키텍처 문서](../architecture/world-engine/project.md)를 참고하세요.

## Per-pane stack direction (if/when this happens)

Reframed around the confirmed four-category graphics/CAD direction (see
`docs/planning/roadmap.md`) — none of these were designed at the time, so this is a
starting hypothesis per category, not a decision:

| Pane | Status here | Stack direction |
|------|-------------|------------------|
| Terminal, Browser, Markdown/Code, Viewer, RSS | **Built**, plain TypeScript/React | No reason to move — these are UI/IO-bound, not compute-bound. Rust wouldn't win anything here. |
| 2D (Figma/Illustrator/Photoshop-class) | **Not started** | Likely candidate: fork Penpot (MIT, already TS/React-ish stack — closest fit to embed) or Krita (GPL, C++/Qt — would need out-of-process hosting). Verify against the real project before assuming either. |
| 3D (Blender-class) | **Not started** | Fork Blender itself, hosted as a **separate native process** per the out-of-process direction below — not an in-renderer engine. |
| Video Editor | **Not started** | Fork Shotcut or Kdenlive rather than wrapping FFmpeg from scratch; if built in-process instead, Rust-heavy timeline/media-graph/frame-scheduling engine wrapping FFmpeg (don't reimplement codecs), TS for timeline UI/media bin/inspector only. |
| Engineering prototypes | World Engine and Hardware Simulator exist as separate codebases | Current implementation scope is listed in `docs/planning/feature-status.md`; no expansion phase is active. |
| Other analysis panes | No implementation selected | Do not treat the old brainstorm as a roadmap. |

## Why this doesn't block anything happening now

`PaneKindDefinition.render(ctx): ReactNode` (see
[`paneKindRegistry.ts`](../../apps/workspace/src/renderer/src/panes/paneKindRegistry.ts))
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
├── workspace-ui/        # TypeScript — current apps/workspace/src/renderer
├── workspace-runtime/    # TypeScript — current apps/workspace/src/main
├── core/
│   ├── media/            # Rust — timeline/frame scheduling wrapping FFmpeg (Video, if built)
│   ├── geometry/         # Rust — shared 2D/3D math (historical proposal; no shared layer is currently planned)
│   └── asset/            # Rust — shared project-file (de)serialization
└── apps/
    ├── 2d/                # hosts the forked 2D engine (Penpot/Krita/etc.)
    ├── 3d/                # hosts Blender as an out-of-process surface
    ├── video/
    └── engineering/       # CAD / game-engine / Omniverse-style, per what actually gets picked
```

This is **not** a restructuring to do now — `apps/workspace/` stays one package
until there's an actual second consumer of a Rust core (a real perf need,
not a hypothetical one). Recorded here so the shape is already agreed on
*if* that day comes, instead of re-litigating it then.

## When this becomes relevant

Revisit this doc when:
- A specific one of the four graphics/CAD categories actually gets
  picked up for real design work (see roadmap.md Phase 2) — that's when
  a real candidate engine's actual hosting/surface/GPU requirements
  should reshape this doc's guesses into an actual plan.
- A pane needs to host something that genuinely cannot run inside a
  Chromium renderer (near-certain for 3D/Blender-class and most of the
  Engineering category).

Until then, every pane in this app is a plain React component, same as
today.

## Related docs

- [09-tool-hosting.md](../architecture/09-tool-hosting.md) — current tool hosting boundaries
- [roadmap.md](../planning/roadmap.md) — accepted product direction
- [roadmap.md](../planning/roadmap.md)
