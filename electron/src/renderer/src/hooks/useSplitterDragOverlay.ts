import { useEffect } from "react";
import { beginDragOverlay, DRAG_OVERLAY, endDragOverlay } from "../interaction/dragSession";

/**
 * Block/hide webviews while resizing flexlayout splitters.
 * WSLg relay (Orca pane-divider-drag): press/release may report as `mouse`
 * but motion/end as `pen` with a different pointerId — match primary
 * non-touch pointers so overlay teardown still runs.
 */
export function useSplitterDragOverlay(): void {
  useEffect(() => {
    let dragging = false;
    let activePointerId: number | null = null;
    let activePointerType: string | null = null;

    const isActivePointer = (e: PointerEvent): boolean =>
      e.pointerId === activePointerId ||
      (e.isPrimary && e.pointerType !== "touch" && activePointerType !== "touch");

    const finishDrag = (): void => {
      if (!dragging) return;
      dragging = false;
      activePointerId = null;
      activePointerType = null;
      endDragOverlay(DRAG_OVERLAY.SPLITTER);
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".flexlayout__splitter")) return;
      dragging = true;
      activePointerId = e.pointerId;
      activePointerType = e.pointerType;
      beginDragOverlay(DRAG_OVERLAY.SPLITTER);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging || !isActivePointer(e)) return;
      finishDrag();
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!dragging || !isActivePointer(e)) return;
      finishDrag();
    };

    const onBlur = () => finishDrag();

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("blur", onBlur, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", onBlur, true);
      finishDrag();
    };
  }, []);
}
