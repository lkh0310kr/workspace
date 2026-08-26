import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DockLocation } from "flexlayout-react";
import { getTabDrag } from "../layout/tabDrag";
import { resolveTabDropTarget, type TabDropPreview } from "../layout/layoutTabDrop";

export function LayoutTabDropOverlay() {
  const [preview, setPreview] = useState<TabDropPreview | null>(null);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!getTabDrag()) {
        setPreview(null);
        return;
      }
      e.preventDefault();
      setPreview(resolveTabDropTarget(e.clientX, e.clientY));
    };
    const clear = () => setPreview(null);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  if (!preview) return null;

  const merge = preview.location === DockLocation.CENTER;
  return createPortal(
    <div
      className={`pane-layout-drop-indicator${merge ? " pane-layout-drop-indicator--frame" : ""}`}
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
