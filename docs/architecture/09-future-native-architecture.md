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
  native process**, and the pane hosts that process's rendering
  surface/window rather than embedding its code. Reasoning: embedding an
  external native window as a first-class Electron DOM element is not
  equally clean across Windows/macOS/Linux, so the *pane* should host a
  surface reference, not try to make Blender "just another React
  component."

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
