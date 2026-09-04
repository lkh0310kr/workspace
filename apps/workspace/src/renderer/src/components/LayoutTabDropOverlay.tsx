import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isPaneDragActive } from "../layout/layoutRef";
import { getTabDrag } from "../layout/tabDrag";
import { resolvePaneDragDropPreview, resolveTabDropTarget, type TabDropPreview } from "../layout/layoutTabDrop";

export function LayoutTabDropOverlay() {
  const [preview, setPreview] = useState<TabDropPreview | null>(null);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      const tabDrag = getTabDrag();
      if (tabDrag) {
        e.preventDefault();
        setPreview(resolveTabDropTarget(e.clientX, e.clientY));
        return;
      }
      if (isPaneDragActive()) {
        e.preventDefault();
        setPreview(resolvePaneDragDropPreview(e.clientX, e.clientY));
        return;
      }
      setPreview(null);
    };
    const clear = () => setPreview(null);
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  if (!preview) return null;

  return createPortal(
    <div
      className="pane-layout-drop-indicator"
      style={{
        left: preview.rect.left,
        top: preview.rect.top,
        width: preview.rect.width,
        height: preview.rect.height,
      }}
    />,
    document.body,
  );
}
