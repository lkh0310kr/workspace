import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";
import { layoutLog } from "../layout/layoutDebugLog";

/** Overlay sources that hide native embeds during drag/resize. */
export const DRAG_OVERLAY = {
  TAB_CHIP: "tab-chip-drag",
  PANE_TAB_STRIP: "pane-tab-strip-drag",
  SPLITTER: "splitter-drag",
} as const;

export type DragOverlayKind = (typeof DRAG_OVERLAY)[keyof typeof DRAG_OVERLAY];

const activeOverlays = new Set<DragOverlayKind>();

/** Hide native embeds for the duration of a drag session. */
export function beginDragOverlay(kind: DragOverlayKind): void {
  if (activeOverlays.has(kind)) return;
  activeOverlays.add(kind);
  pushOverlayBlock(kind);
}

/** Restore embed visibility when a drag session ends. */
export function endDragOverlay(kind: DragOverlayKind): void {
  if (!activeOverlays.delete(kind)) {
    popOverlayBlock(kind);
    return;
  }
  popOverlayBlock(kind);
}

export interface TabDragPayload {
  sourceTabNodeId: string;
  tabId: string;
}

let tabChipPayload: TabDragPayload | null = null;

export function startTabChipDrag(payload: TabDragPayload): void {
  tabChipPayload = payload;
  beginDragOverlay(DRAG_OVERLAY.TAB_CHIP);
  layoutLog("dragSession.startTabChipDrag", "tab chip drag start", { ...payload });
}

export function getTabChipDrag(): TabDragPayload | null {
  return tabChipPayload;
}

export function endTabChipDrag(): void {
  if (tabChipPayload) {
    layoutLog("dragSession.endTabChipDrag", "tab chip drag end", { ...tabChipPayload });
  }
  tabChipPayload = null;
  endDragOverlay(DRAG_OVERLAY.TAB_CHIP);
}
