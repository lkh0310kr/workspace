import { useEffect } from "react";
import { beginDragOverlay, DRAG_OVERLAY, endDragOverlay } from "../interaction/dragSession";

/** Block/hide webviews while resizing flexlayout splitters. */
export function useSplitterDragOverlay(): void {
  useEffect(() => {
    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".flexlayout__splitter")) return;
      dragging = true;
      beginDragOverlay(DRAG_OVERLAY.SPLITTER);
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      endDragOverlay(DRAG_OVERLAY.SPLITTER);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      if (dragging) endDragOverlay(DRAG_OVERLAY.SPLITTER);
    };
  }, []);
}
