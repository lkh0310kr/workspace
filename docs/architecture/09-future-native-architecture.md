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
