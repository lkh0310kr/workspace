// Cross-component drag state for tab-chip drag-and-drop (PaneTabStrip.tsx).
// `dataTransfer.getData()` is only readable on `drop`, not `dragover` — so
// live insertion-line hints (computed during dragover, before any drop
// happens) can't read the payload from the DragEvent itself. This
// module-level variable is the workaround: every PaneTabStrip instance
// reads/writes the same value, regardless of which one started the drag.
// Same pattern as layoutRef.ts's module-level Layout ref.
export interface TabDragPayload {
  sourceTabNodeId: string;
  tabId: string;
}

let current: TabDragPayload | null = null;

export function startTabDrag(payload: TabDragPayload): void {
  current = payload;
}

export function getTabDrag(): TabDragPayload | null {
  return current;
}

export function endTabDrag(): void {
  current = null;
}
