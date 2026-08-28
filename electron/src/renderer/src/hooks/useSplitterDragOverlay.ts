import { useEffect } from "react";
import { beginDragOverlay, DRAG_OVERLAY, endDragOverlay } from "../interaction/dragSession";
import {
  isActivePointerDragEvent,
  type ActivePointerDragState,
} from "../interaction/wslg-pointer-drag";

/** Block/hide webviews while resizing flexlayout splitters. */
export function useSplitterDragOverlay(): void {
  useEffect(() => {
    let dragging = false;
    let activePointer: ActivePointerDragState | null = null;
    let windowListenersAttached = false;

    const finishDrag = (): void => {
      if (!dragging) {
        activePointer = null;
        return;
      }
      dragging = false;
      activePointer = null;
      endDragOverlay(DRAG_OVERLAY.SPLITTER);
    };

    const removeWindowListeners = (): void => {
      if (!windowListenersAttached) return;
      windowListenersAttached = false;
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", onWindowBlur, true);
    };

    const addWindowListeners = (): void => {
      if (windowListenersAttached) return;
      windowListenersAttached = true;
      window.addEventListener("pointerup", onPointerUp, true);
      window.addEventListener("pointercancel", onPointerCancel, true);
      window.addEventListener("blur", onWindowBlur, true);
    };

    const onPointerUp = (e: PointerEvent): void => {
      if (!isActivePointerDragEvent(e, activePointer)) return;
      removeWindowListeners();
      finishDrag();
    };

    const onPointerCancel = (e: PointerEvent): void => {
      if (!isActivePointerDragEvent(e, activePointer)) return;
      removeWindowListeners();
      finishDrag();
    };

    const onWindowBlur = (): void => {
      removeWindowListeners();
      finishDrag();
    };

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".flexlayout__splitter")) return;
      if (dragging) {
        removeWindowListeners();
        finishDrag();
      }
      dragging = true;
      activePointer = { pointerId: e.pointerId, pointerType: e.pointerType };
      beginDragOverlay(DRAG_OVERLAY.SPLITTER);
      addWindowListeners();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      removeWindowListeners();
      if (dragging) finishDrag();
    };
  }, []);
}
