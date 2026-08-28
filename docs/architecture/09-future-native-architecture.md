# Future native architecture (long-term, not designed yet)

**Status:** Reference direction only. Nothing here is scheduled, designed
in detail, or started. Captured so this context survives across sessions
(human or AI) — not just in one conversation's memory.

## Origin

Originally discussed while planning a Vector Editor pane, which was built
(M1-M6) and then deliberately removed — direction shifted away from
Creative panes toward engineering/analysis panes (Database, Network,
Hardware/Embedded, GIS, Robotics — see `docs/ideation.md`'s brainstorm).
The architecture direction below outlives that specific pane: it came
from an external discussion (not written with knowledge of this
codebase) and should be read as directional inspiration, not a spec to
implement literally, and applies just as much to a future heavy
engineering pane (a Packet Analyzer's live capture pipeline, a Hex/Binary
Inspector's parsing, a Robot Simulator's physics) as it did to Vector.

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

Filtered down to what's actually relevant to *this* app (dropped: Game
Engine, generic "Browser is just Chromium" — already true here, nothing
to decide) and reframed around what's actually built vs. actually
planned. Creative panes (Vector, Pixel Art) are gone from this table —
direction shifted to engineering/analysis panes (see `docs/ideation.md`);
none of those are designed yet, so there's no per-pane stack call to make
until one actually gets picked up:

| Pane | Status here | Stack direction |
|------|-------------|------------------|
| Terminal, Browser, Markdown/Code, Viewer, RSS | **Built**, plain TypeScript/React | No reason to move — these are UI/IO-bound, not compute-bound. Rust wouldn't win anything here. |
| Video Editor | **Not started**, far future | Rust-heavy if ever built — timeline/media-graph/frame-scheduling engine wrapping FFmpeg (don't reimplement codecs), TS for timeline UI/media bin/inspector only. |
| 3D / Blender-class | **Not started**, far future | Rust + wgpu scene/mesh/material/renderer, likely as a genuinely separate native process per the "out-of-process" direction above, not an in-renderer engine. |
| Engineering/analysis panes (Packet Analyzer, Hex/Binary Inspector, Serial/Embedded Studio, Robot Simulator, etc. — see `docs/ideation.md`) | **Brainstormed, not designed** | Each would need its own pass at this table once actually scoped — several (packet decoding, binary parsing, physics simulation) look like real Rust-core candidates by the same "measurably too slow in pure TypeScript" test below, but that's a claim to verify per-pane, not assume. |

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
│   ├── engineering/      # Rust — packet decoding / binary parsing / simulation (per-pane, if any of these get built)
│   └── asset/            # Rust — shared project-file (de)serialization
└── apps/
    ├── video/
    └── ...                # one per engineering pane that actually ships
```

This is **not** a restructuring to do now — `electron/` stays one package
until there's an actual second consumer of a Rust core (a real perf need,
not a hypothetical one). Recorded here so the shape is already agreed on
*if* that day comes, instead of re-litigating it then.

## When this becomes relevant

Revisit this doc when:
- A pane's compute/rendering work is measurably too slow in pure
  TypeScript (candidate: a future packet decoder, binary parser, or
  simulation-heavy engineering pane — see `docs/ideation.md`).
- A pane needs to host something that genuinely cannot run inside a
  Chromium renderer (candidate: a real 3D/Blender-class pane).

Until then, every pane in this app is a plain React component, same as
today.

## Related docs

- [07-future-phases.md](./07-future-phases.md) — near-term (not long-term) planned work
- [ideation.md](../ideation.md) — the engineering/analysis pane brainstorm that replaced Creative panes as the near-term direction
- [ROADMAP.md](../ROADMAP.md)
