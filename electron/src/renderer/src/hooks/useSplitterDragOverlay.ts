import { useEffect } from "react";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";

/** Block/hide webviews while resizing flexlayout splitters. */
export function useSplitterDragOverlay(): void {
  useEffect(() => {
    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".flexlayout__splitter")) return;
      dragging = true;
      pushOverlayBlock("splitter-drag");
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      popOverlayBlock("splitter-drag");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      if (dragging) popOverlayBlock("splitter-drag");
    };
  }, []);
}
