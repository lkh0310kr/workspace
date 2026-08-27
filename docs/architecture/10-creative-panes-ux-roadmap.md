# Creative panes UX roadmap (Vector Editor now, Pixel Art informed by it)

**Status:** Planning only — a prioritized backlog, not a build order. Items
here become work when explicitly picked up; nothing in this doc is
scheduled.

## Why this doc exists

Vector Editor's M1-M5 (see [08-vector-editor.md](./08-vector-editor.md)) is
a complete, usable *editing primitive* — draw, select, transform, group,
undo/redo, export. But "usable" and "good UX" are different bars. Real
vector tools (Figma, Illustrator, Penpot) carry a large surface of small
conveniences that make an editor feel professional rather than functional:
alignment, boolean ops, viewport pan/zoom, snapping, per-object lock/hide,
z-order control, a shortcuts reference. Vector Editor's own design doc
listed some of these ("pan/zoom", "marquee select") as planned — checking
the actual shipped code shows they were never built. This doc catalogs the
gap and where the ideas came from, so future work has a map instead of
starting from a blank page each time.

`ref-proj/penpot` (MIT, cloned for this doc — read for patterns only, per
this project's `ref-proj/` convention, never depended on as a package) is
the reference: an open-source Figma-class vector tool with a fully fleshed
out feature surface. Its command list
(`frontend/src/app/main/data/workspace/shortcuts.cljs`) and per-shape
option menus (`frontend/src/app/main/ui/workspace/sidebar/options/menus/`)
are what most of this backlog is drawn from — not to copy Penpot's UI
verbatim, but as a checklist of "what does a real vector tool's editing
experience include" to compare Vector Editor against.

## How to use this doc

Three tiers, roughly in priority order. Tier 1 closes gaps the design doc
already promised. Tier 2 is the next layer of professional-editor UX.
Tier 3 is explicitly aspirational — Penpot features that are real but
disproportionate for a single-user personal app, kept here so they're not
silently forgotten, not because they're expected soon.

Each tier's items are also in `TODO.md` as individual checkboxes so they
show up in the normal workflow — this doc is the *why* and *grouping*,
TODO.md is the *tracking*.

## Tier 1 — close gaps the design doc already promised

**Status: done** (implemented as VectorEditorContent.tsx's M6 — see
[08-vector-editor.md](./08-vector-editor.md)'s M6 scope note for the real
implementation decisions, e.g. why pan/zoom is session-local and why
"reset zoom" and "zoom to fit" ended up being the same action). Left
below as the record of what the gap was and where it came from.

`08-vector-editor.md`'s "Core interactions" section describes pan/zoom
and marquee-select as part of the core interaction set. Neither existed in
the shipped `VectorEditorContent.tsx` at the time this doc was written
(verified by grep — no `zoom`, `pan`, `marquee`, `wheel`, `flip`, or
z-order state anywhere in the file). These weren't new scope, they were
finishing what was already agreed:

- **Viewport pan/zoom** — a view transform on a wrapping `<g>` (as the
  design doc already specifies), space+drag to pan, wheel/pinch to zoom,
  zoom-to-fit and reset-zoom actions. Currently the canvas is a single
  fixed-size `<svg>` at `doc.width`×`doc.height` with no way to see a
  large document or work at a comfortable scale on a small one.
- **Marquee (rubber-band) select** — drag on empty canvas to select every
  shape whose bounds intersect the drag rectangle. Today the only way to
  build a multi-selection is repeated shift-click.
- **Z-order control** — bring-to-front / bring-forward / send-backward /
  send-to-back. `doc.objects` is already array-order-is-draw-order (see
  `sceneGraph.ts`), so this is array reordering, not a new concept — it's
  just never been exposed as an action.
- **Flip horizontal / flip vertical** — `scaleX *= -1` / `scaleY *= -1` on
  the current selection's transform, pivoting about the same local-center
  point `resizeTransform` already uses. Cheap to add given the transform
  model already in place.

## Tier 2 — professional-editor conveniences (Penpot-inspired, new scope)

**Alignment & distribution** (Penpot: `:align-left/right/top/bottom/
hcenter/vcenter`, `:h-distribute`, `:v-distribute`) — for a 2+ selection,
align edges/centers to the selection's own bounding box, and distribute
evenly spaced. Immediately useful once real documents have more than a
couple of objects.

**Snapping** (Penpot: `viewport/snap_points.cljs`, `snap_distances.cljs`,
`:toggle-snap-guides`) — snap a dragged shape's edges/center to other
shapes' edges/centers within a small threshold, with a visual guide line
while snapping is active. A real complexity jump from anything built so
far (needs a spatial index or at minimum an O(n) scan against visible
siblings per drag frame) — the first Tier 2 item that isn't just "expose
an action," worth a design pass of its own before starting.

**Boolean path operations** (Penpot: `:bool-union/difference/
intersection/exclude`) — union/subtract/intersect/exclude on 2+ selected
paths, producing one new `PathObject`. Explicitly listed as a v1
non-goal in `08-vector-editor.md` ("genuinely hard problems on their
own") — real polygon clipping (e.g. a Sutherland-Hodgman or
Weiler-Atherton style algorithm, or porting a small clipping library) is
its own scoped effort, not a quick add.

**Per-object lock & visibility** (Penpot: `:toggle-lock`, `:toggle-
visibility`) — a locked object ignores selection/drag; a hidden object
doesn't render and is skipped by hit-testing. Needs a `locked`/`visible`
flag added to `BaseObject` in `sceneGraph.ts`, plus a real **layers
panel** listing `doc.objects` (currently there is no layers list at all —
selection only happens by clicking shapes on canvas) with per-row
lock/visibility toggles, matching Penpot's `sidebar/layers.cljs` +
`layer_item.cljs` pattern.

**Rulers & guides** (Penpot: `viewport/rulers.cljs`, `guides.cljs`,
`:toggle-rulers`, `:toggle-guides`) — horizontal/vertical ruler strips
around the canvas showing document-space coordinates at the current zoom,
and draggable guide lines pulled off the rulers. Depends on Tier 1's
pan/zoom viewport transform existing first.

**Keyboard shortcuts reference** (Penpot: `:show-shortcuts`, `ui/
shortcuts.cljs`) — a modal/panel listing every shortcut this pane
supports. Vector Editor already has a real shortcut set (⌘Z/⌘⇧Z/⌘G/⌘⇧G/
⌘D/⌘C/⌘V/Backspace/arrows/V-R-O-L-P-T) with no in-app discovery path
other than each tool button's title tooltip.

**Richer color system** (Penpot: `colorpicker/harmony.cljs`, `ramp.cljs`,
`color_palette.cljs`) — a saved/recent-colors palette strip next to the
existing native `<input type="color">` pickers, so a document's color
scheme is reusable across objects without re-picking hex values each
time. Not full color libraries/tokens (Tier 3) — just persisted
recent/custom swatches, document-scoped.

**Copy/paste style** (Penpot: `:copy-props`, `:paste-props`) — copy one
object's `style` (fill/stroke/width/opacity) and apply it to another
selection, distinct from the existing copy/paste-*object* (⌘C/⌘V already
duplicates whole objects; this is style-only, faster for "make this
match that").

## Tier 3 — aspirational, explicitly not expected soon

Real Penpot features that are disproportionate for a single-user personal
app right now — listed so they're not silently lost, not because they're
queued:

- **Components/instances** (Penpot: `menus/component.cljs`, `:create-
  component-variant`, `:detach-component`) — reusable symbols with
  overridable instances. Real complexity (instance override tracking,
  detach semantics) — Figma/Illustrator-tier feature.
- **Auto-layout / flex & grid containers** (Penpot: `layout_container.cljs`,
  `layout_item.cljs`, `:toggle-layout-flex`, `:toggle-layout-grid`) —
  CSS-flexbox-like auto-arranging groups. A UI-design-tool feature more
  than a general vector-drawing one; revisit only if Vector Editor's real
  use skews toward UI mockups specifically.
- **Design tokens** (Penpot: `workspace/tokens/*`) — named,
  theme-swappable values (colors, spacing) referenced by shapes instead of
  literals. A multi-file/multi-theme-project feature; not relevant until
  there's more than one active vector document sharing a style.
- **Comments & multiplayer presence** (Penpot: `comments.cljs`,
  `presence.cljs`) — collaboration features. Explicitly out of scope per
  `08-vector-editor.md`'s non-goals (multiplayer/collaboration).
- **Prototyping / interactions** (Penpot: `menus/interactions.cljs`,
  `viewer/`) — click-through prototype flows between frames/pages. Belongs
  to a "Presentation"-tier pane (already listed as unstarted/reference-only
  in the tech tree), not Vector Editor itself.
- **Multi-page documents & artboards/frames** (Penpot: `sidebar/
  sitemap.cljs`, `shapes/frame.cljs`) — Vector Editor's `VectorDocument`
  is single-canvas, single-page. Real restructuring (a document becomes a
  list of pages, each with its own object tree) — only worth it if a
  single canvas is genuinely limiting in real use.

## Shared-infrastructure note (for when Pixel Art actually starts)

Two Tier 1/2 items are worth building in a pane-agnostic way from the
start, since Pixel Art (the next pane per `08-vector-editor.md`'s "Explicit
non-goals," still unstarted) will need the *same* things, not
lookalikes:

- **Viewport pan/zoom** — the "a view transform on a wrapping element,
  driven by wheel/drag" pattern is identical whether the child content is
  an SVG `<g>` (Vector) or a `<canvas>` (Pixel Art, where zoom also needs
  `imageSmoothingEnabled = false` for crisp pixels — the one real
  difference). Worth a small shared `useViewportPanZoom` hook once Pixel
  Art actually starts, rather than copy-pasting Vector's version — this is
  the "extract after the second concrete case needs it" moment
  `paneKindRegistry.ts` already modeled for this codebase (see
  `08-vector-editor.md`'s "Why Vector, why first" section).
- **Undo/redo history stack** — `vectorHistory.ts`'s `push/undo/redo/
  canUndo/canRedo` shape is already generic over the document type (it
  never touches `VectorDocument`'s fields, only takes/returns whichever
  type is passed in). When Pixel Art needs the identical behavior for
  `PixelDocument`, generalize it into one shared module both panes import
  rather than duplicating the ~40 lines verbatim.

Not done now — noted so the decision is made once, not re-litigated pane
by pane.

## Related docs

- [08-vector-editor.md](./08-vector-editor.md) — Vector Editor's own
  design doc and non-goals list
- [ref-proj/penpot](../../ref-proj/penpot) — reference-only clone, not a
  dependency (see repo root `.gitignore`'s `/ref-proj` rule)
- [TODO.md](../../TODO.md) — the individually-tracked checkbox version of
  this backlog
