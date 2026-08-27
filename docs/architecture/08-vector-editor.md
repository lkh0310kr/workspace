# Vector Editor pane (design, not yet built)

**Status:** Planned. Nothing under this doc is implemented yet.

## Why Vector, why first

Workspace is meant to eventually host "professional creative tool" panes —
inspired by the Illustrator/Photoshop/Figma/Blender lineage, but that
lineage is reference material, not a roadmap. Direction, decided directly:
build **one** pane at a time, to genuine completion, before starting the
next — not many panes at once. **Vector Editor goes first.**

Illustrator/Figma-style vector editing (paths, shapes, groups, transforms)
is the highest-value, most reusable foundation among the candidates — the
same primitives generalize to a diagram or presentation tool later, if
those ever get built. Pixel Art was the other candidate considered; Vector
was picked. Paint (raster/Photoshop-style), Diagram, Presentation, 2D
Animation, and 3D are explicitly **not started** and not committed to any
schedule — see "Explicit non-goals" below.

This also deliberately does **not** design a generic "Canvas Engine"
abstraction shared across future creative panes up front. This project's
own recent precedent —
[`panes/paneKindRegistry.ts`](../../electron/src/renderer/src/panes/paneKindRegistry.ts),
which collapsed six pane-kind switches into one registry — was extracted
*after* six concrete pane kinds existed, not designed speculatively before
any of them. Vector Editor's internals should be written so a shared piece
*could* be split out later (once a second creative pane actually needs the
same thing), but that split isn't built now.

## Rendering approach: real SVG DOM

React-rendered `<rect>` / `<ellipse>` / `<path>` / `<text>` / `<g>`
elements, driven by the scene-graph JSON below — not Canvas2D, and not a
canvas library (Konva/Fabric/Pixi.js). Reasoning:

- SVG *is* the target export format (see Export below), so exporting
  becomes serializing the same shape data, not maintaining a second
  renderer.
- React's diffing already handles efficient SVG updates — every other pane
  in this app is already a React component tree; this stays consistent
  with that instead of introducing an imperative rendering escape hatch.
- No new runtime dependency.
- MVP scale (one user, not thousands of live objects, no real-time
  collaboration) doesn't need a custom GPU renderer the way Figma's
  actually does — that would be solving a problem this app doesn't have.

## Data model

The scene graph is the source of truth; SVG is a *view* of it — the same
relationship CodeMirror's `EditorState` has to its DOM elsewhere in this
app (see `EditorContent.tsx`).

```ts
interface VectorDocument {
  id: string;
  width: number;
  height: number;
  background: string;
  objects: SceneObject[]; // tree — Group nests children directly
}

type SceneObject =
  | { id: string; type: "rect"; x: number; y: number; width: number; height: number; rx?: number; style: ShapeStyle; transform: Transform }
  | { id: string; type: "ellipse"; cx: number; cy: number; rx: number; ry: number; style: ShapeStyle; transform: Transform }
  | { id: string; type: "line"; x1: number; y1: number; x2: number; y2: number; style: ShapeStyle; transform: Transform }
  | { id: string; type: "path"; anchors: PathAnchor[]; closed: boolean; style: ShapeStyle; transform: Transform }
  | { id: string; type: "text"; x: number; y: number; content: string; fontSize: number; fontFamily: string; style: ShapeStyle; transform: Transform }
  | { id: string; type: "group"; children: SceneObject[]; transform: Transform };

interface PathAnchor {
  x: number;
  y: number;
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
}

interface ShapeStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
}

interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}
```

**Path's source of truth is its anchor list**, not a pre-baked `d` string.
Each anchor carries its own position plus optional in/out bezier handles;
the `d` attribute is *derived* for rendering (`bezierPath.ts` below). This
is what makes pen-tool output re-editable later — dragging a handle to
reshape a curve (Illustrator's "Direct Selection" tool) — instead of a
frozen SVG path blob nothing can reach back into.

## Core interactions (scoped to Vector — not a generic engine)

- **Viewport** — pan (space+drag) and zoom (wheel/pinch) are a single view
  transform applied to a wrapping `<g>`, not stored per-object.
- **Selection** — click to select, shift-click to add/remove, marquee
  (rubber-band) drag-select on empty canvas.
- **Transform** — the current selection gets a bounding-box overlay with
  resize handles (corners + edges) and a rotate handle.
- **Pen tool** — click places a corner anchor; click+drag places a smooth
  anchor with symmetric handles (Illustrator convention); closing happens
  on click-first-point or Enter.
- **Undo/Redo** — a linear history of immutable `VectorDocument` snapshots,
  pushed on each committed action, with a pointer for undo/redo. Not a
  command/inverse-command system — simplest correct approach at this
  document's size; only revisit if it's actually measured to be too slow,
  per this project's "don't design for hypothetical requirements"
  convention (see root `CLAUDE.md`-equivalent guidance already followed
  elsewhere in this codebase).

## Persistence

A plain JSON project file — no zip/bundle needed. Unlike a raster/Paint
document, there's no binary layer data to bundle alongside a manifest; the
whole `VectorDocument` serializes directly to JSON.

**Export:**
- **SVG** — serialize the scene graph to real SVG markup (`svgExport.ts`).
- **PNG** — rasterize the serialized SVG via an offscreen `<canvas>`
  (draw an `<img>` sourced from a `data:image/svg+xml` blob, then
  `toDataURL`/`toBlob`).

## Pane integration

Follows the exact pattern `panes/paneKindRegistry.ts` already established
(see [`03-workspace-and-layout.md`](./03-workspace-and-layout.md) for the
pane-tab model this plugs into):

- `TabKind` gains `"vector"` — plus the matching zod entry in
  `src/shared/layoutSalvage.ts`. `PaneTabItem` reuses the existing
  `filePath`/`absolutePath` fields (same as code/markdown/viewer); no new
  persisted fields needed.
- `src/renderer/src/panes/kinds/vectorKind.tsx` — one
  `PaneKindDefinition`, `hasFileExplorer: true` like code/markdown/viewer.
- `src/renderer/src/panes/VectorEditorContent.tsx` — the actual editor UI
  (the bulk of the implementation work), plus pure/testable modules
  mirroring this codebase's established "extract pure logic + vitest"
  pattern (`srtToVtt.ts`, `mediaRange.ts`, `markdownTitleRename.ts` are the
  precedents to follow):
  - `panes/vector/sceneGraph.ts` — tree ops (find/update/delete, flatten,
    hit-test)
  - `panes/vector/bezierPath.ts` — anchor list ↔ SVG path `d`,
    hit-testing along a path
  - `panes/vector/vectorTransform.ts` — bounding-box + resize/rotate
    handle math
  - `panes/vector/vectorHistory.ts` — undo/redo snapshot stack
  - `panes/vector/svgExport.ts` — scene graph → SVG string

## Build order

Internal milestones — each one independently usable and shippable, not one
giant change:

| # | Scope |
|---|-------|
| M1 | Scene graph + SVG rendering + Selection + Transform, Rect/Ellipse only. Save/load JSON. |
| M2 | Pen tool (anchors + bezier handles), Line tool. |
| M3 | Stroke/Fill editing UI, Group/Ungroup. |
| M4 | Undo/Redo, Export SVG/PNG, polish (snapping, keyboard nudge, delete, duplicate, copy/paste). |
| M5 | Text tool — isolated last; font rendering/measurement is its own scope. |

**M3 scope note:** a group's own transform is translation-only in this
pass — selecting a group shows an outline and lets you drag it as a whole
(children keep their individual transforms, composed for free via nested
SVG `<g>`), but not resize/rotate handles for the group itself. That's
what keeps Ungroup's math a plain `child.transform.x/y += group.transform
.x/y` instead of a general 2D affine decomposition (which doesn't always
cleanly reverse once rotation and non-uniform scale are both involved).
Full group resize/rotate is a later polish item, revisited if it turns
out to matter in practice.

## Explicit non-goals for v1

Boolean operations (union/subtract/intersect), gradients, constraints/
auto-layout, components/instances, and multiplayer/collaboration are all
out of scope for v1 — genuinely hard problems on their own, deliberately
deferred rather than half-built.

Everything outside Vector — Pixel Art, Diagram, Presentation, 2D
Animation, Paint (raster/Photoshop-style), 3D Modeler — stays unstarted.
Only reconsidered once Vector Editor is genuinely complete and in real
daily use, not before.

## Reference: porting from tldraw, not guessing

Per direct instruction, this pane's interaction code should be verified
against a real, battle-tested implementation rather than derived from
scratch wherever a proven pattern exists — the same standing rule this
whole app follows for Orca/VSCode ports. `tldraw` (cloned into
`ref-proj/tldraw`, MIT, same React/TypeScript stack) is the reference —
**read for patterns, not depended on as a package**: this pane is meant
to be Workspace's own primitive (see the Canvas/Layer/Selection/
Transform/Undo core other creative panes would eventually share), not a
wrapper around tldraw's SDK.

Confirmed so far by reading `packages/tldraw/src/lib/tools/SelectTool/childStates/`:
- **Resizing.ts** — their scale-from-opposite-handle math (`distanceFromScaleOriginNow / distanceFromScaleOriginAtStart`, computed in a rotation-corrected frame) is the same approach `resizeTransform` already uses, just far more abstracted (multi-shape, frames, snapping). Cross-validates the math rather than changing it.
- **Rotating.ts** — caught a real bug: this doc's Vector Editor originally set rotation to the pointer's *absolute* angle from center, which jumps the shape the instant a rotate drag starts if the grab point isn't exactly on the handle. tldraw computes rotation as `startRotation + (currentPointerAngle - startPointerAngle)` — a delta from wherever the drag began. Ported as `rotationFromDrag`/`pointerAngleDegrees` in `vectorTransform.ts`.

## Related docs

- [paneKindRegistry design](../../electron/src/renderer/src/panes/paneKindRegistry.ts) — the pattern this plugs into
- [03-workspace-and-layout.md](./03-workspace-and-layout.md) — pane-tab model
- [09-future-native-architecture.md](./09-future-native-architecture.md) — long-term direction (Rust core, native-process panes) this design deliberately doesn't block, but also doesn't build yet
- [ROADMAP.md](../ROADMAP.md) — Phase H
