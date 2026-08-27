# Future native architecture (long-term, not designed yet)

**Status:** Reference direction only. Nothing here is scheduled, designed
in detail, or started. Captured so this context survives across sessions
(human or AI) — not just in one conversation's memory.

## Origin

Discussed while planning the [Vector Editor pane](./08-vector-editor.md).
The specific architecture below came from an external discussion (not
written with knowledge of this codebase) and should be read as directional
inspiration, not a spec to implement literally.

## The direction

Electron stays as a **thin Workspace Shell** — window/pane management,
tabs/splits, command palette, file dialogs, app lifecycle, IPC. It does
*not* try to be the implementation technology for every pane forever.
Heavy graphics/compute work moves out as panes get more demanding:

- **In-process, still Electron**: lighter graphics panes (Vector, Paint)
  can move their core geometry/rendering work — Bezier math, boolean
  path operations, hit-testing, rasterization — into a **Rust core**
  (via native module / WASM), reached from the TypeScript UI over IPC or
  FFI, using **wgpu** for GPU rendering. The Electron renderer keeps the
  UI chrome (toolbar, layers panel, inspector, dialogs); Rust does the
  expensive geometry. This is *not* a rewrite of Electron itself — the
  Workspace shell stays TypeScript/React.
- **Out-of-process, Blender-class apps**: something like Blender is not
  meant to run inside an Electron renderer at all. It runs as a **separate
  native process**, and the pane hosts that process's rendering
  surface/window rather than embedding its code. Reasoning: embedding an
  external native window as a first-class Electron DOM element is not
  equally clean across Windows/macOS/Linux, so the *pane* should host a
  surface reference, not try to make Blender "just another React
  component."

## Per-pane stack direction (if/when this happens)

A second round of the same external discussion went pane-by-pane. Filtered
down to what's actually relevant to *this* app (dropped: Game Engine,
generic "Browser is just Chromium" — already true here, nothing to decide)
and reframed around what's actually built vs. actually planned:

| Pane | Status here | Stack direction |
|------|-------------|------------------|
| Terminal, Browser, Markdown/Code, Viewer, RSS | **Built**, plain TypeScript/React | No reason to move — these are UI/IO-bound, not compute-bound. Rust wouldn't win anything here. |
| Vector | **Planned next** ([08](./08-vector-editor.md)), starting plain TS/SVG | Candidate to move geometry (Bezier, boolean ops, hit-testing, transform math) into a Rust core *if* M2/M3 prove it's needed — see "When this becomes relevant" below. UI (toolbar, inspector, layers) stays TS regardless. |
| Illustrator/Figma-style extensions (artboards, components, constraints, auto-layout) | **Not started** | If ever built, extend the *same* Vector core rather than a separate engine — Illustrator-style features are a superset of Vector's geometry, Figma-style adds a layout/constraint engine on top (own Rust candidate: layout computation, not rendering). |
| Pixel Art | **Not started**, reference only | Candidate for a WebGPU-backed pixel/texture canvas from the start (RGBA texture → GPU texture → canvas is a natural WebGPU fit), TS UI around it. Lower priority than Vector per this session's direction. |
| Video Editor | **Not started**, far future | Rust-heavy if ever built — timeline/media-graph/frame-scheduling engine wrapping FFmpeg (don't reimplement codecs), TS for timeline UI/media bin/inspector only. |
| 3D / Blender-class | **Not started**, far future | Rust + wgpu scene/mesh/material/renderer, likely as a genuinely separate native process per the "out-of-process" direction above, not an in-renderer engine. |

## Why this doesn't block anything happening now

`PaneKindDefinition.render(ctx): ReactNode` (see
[`paneKindRegistry.ts`](../../electron/src/renderer/src/panes/paneKindRegistry.ts))
already doesn't assume "plain HTML div forever." A future GPU-backed
canvas pane, or a pane that hosts an external process's rendering surface,
is just a different kind's `render()` implementation — no rearchitecture
of the pane system is forced by building the current [Vector
Editor](./08-vector-editor.md) as plain SVG DOM today.

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
│   ├── geometry/         # Rust — Bezier, boolean ops, hit-testing (Vector's engine, if extracted)
│   ├── canvas/           # Rust — raster/texture ops (Pixel Art's engine, if built)
│   ├── media/            # Rust — timeline/frame scheduling wrapping FFmpeg (Video, if built)
│   └── asset/            # Rust — shared project-file (de)serialization
└── apps/
    ├── vector/
    ├── pixel/
    └── video/
```

This is **not** a restructuring to do now — `electron/` stays one package
until there's an actual second consumer of a Rust core (a real perf need,
not a hypothetical one). Recorded here so the shape is already agreed on
*if* that day comes, instead of re-litigating it then.

## When this becomes relevant

Revisit this doc when:
- A pane's geometry/rendering work is measurably too slow in pure
  TypeScript (candidate: Vector Editor past M2/M3, or a future Pixel
  Art/raster pane).
- A pane needs to host something that genuinely cannot run inside a
  Chromium renderer (candidate: a real 3D/Blender-class pane).

Until then, every pane in this app is a plain React component, same as
today.

## Related docs

- [08-vector-editor.md](./08-vector-editor.md) — the pane this discussion came from
- [07-future-phases.md](./07-future-phases.md) — near-term (not long-term) planned work
- [ROADMAP.md](../ROADMAP.md)
