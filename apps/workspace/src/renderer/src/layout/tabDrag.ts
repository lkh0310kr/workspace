// Cross-component drag state for tab-chip drag-and-drop (PaneTabStrip.tsx).
// `dataTransfer.getData()` is only readable on `drop`, not `dragover` — so
// live insertion-line hints (computed during dragover, before any drop
// happens) can't read the payload from the DragEvent itself. This
// module-level variable is the workaround: every PaneTabStrip instance
// reads/writes the same value, regardless of which one started the drag.
// Same pattern as layoutRef.ts's module-level Layout ref.
export {
  type TabDragPayload,
  endTabChipDrag as endTabDrag,
  getTabChipDrag as getTabDrag,
  startTabChipDrag as startTabDrag,
} from "../interaction/dragSession";
