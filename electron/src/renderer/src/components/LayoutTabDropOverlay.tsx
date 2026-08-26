import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getTabDrag } from "../layout/tabDrag";
import {
  readFlexlayoutDropIndicator,
  resolveTabDropTarget,
  type TabDropPreview,
} from "../layout/layoutTabDrop";

export function LayoutTabDropOverlay() {
  const [rect, setRect] = useState<TabDropPreview["rect"] | null>(null);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (getTabDrag()) {
        e.preventDefault();
        setRect(resolveTabDropTarget(e.clientX, e.clientY)?.rect ?? null);
        return;
      }
      const flexRect = readFlexlayoutDropIndicator();
      if (flexRect) {
        e.preventDefault();
        setRect(flexRect);
        return;
      }
      setRect(null);
    };
    const clear = () => setRect(null);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  if (!rect) return null;

  return createPortal(
    <div
      className="pane-layout-drop-indicator"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    />,
    document.body,
  );
}
