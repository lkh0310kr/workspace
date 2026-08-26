import { DockLocation } from "flexlayout-react";

const EDGE_RATIO = 0.2;

export interface TabDropPreview {
  targetTabNodeId: string;
  location: DockLocation;
  rect: { left: number; top: number; width: number; height: number };
}

function isDragChrome(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.classList.contains("flexlayout__layout_overlay") ||
    el.classList.contains("flexlayout__outline_rect") ||
    el.classList.contains("flexlayout__outline_rect_edge") ||
    el.classList.contains("pane-layout-drop-indicator")
  );
}

function resolveTabDropPreviewByGeometry(x: number, y: number): TabDropPreview | null {
  for (const tabEl of document.querySelectorAll<HTMLElement>(
    ".layout-host-item--active [id^='flexlayout-tab-']",
  )) {
    const tabRect = tabEl.getBoundingClientRect();
    if (x < tabRect.left || x > tabRect.right || y < tabRect.top || y > tabRect.bottom) {
      continue;
    }
    const location = resolveDockLocation(tabRect, x, y);
    const rect = previewRect(tabRect, location);
    if (!rect) continue;
    return {
      targetTabNodeId: tabEl.id.slice("flexlayout-tab-".length),
      location,
      rect,
    };
  }
  return null;
}

export function isOverPaneTabStrip(x: number, y: number): boolean {
  for (const el of document.elementsFromPoint(x, y)) {
    if (isDragChrome(el)) continue;
    if (el.closest(".pane-tab-strip")) return true;
  }
  return false;
}

function resolveDockLocation(rect: DOMRect, x: number, y: number): DockLocation {
  const relX = (x - rect.left) / rect.width;
  const relY = (y - rect.top) / rect.height;
  if (relX < EDGE_RATIO) return DockLocation.LEFT;
  if (relX > 1 - EDGE_RATIO) return DockLocation.RIGHT;
  if (relY < EDGE_RATIO) return DockLocation.TOP;
  if (relY > 1 - EDGE_RATIO) return DockLocation.BOTTOM;
  return DockLocation.CENTER;
}

/** Half-pane (or full-pane for center) fill rects — matches flexlayout's native
 *  outline sizing so chip drag and pane-strip drag look identical. */
function previewRect(tabRect: DOMRect, location: DockLocation) {
  const halfW = tabRect.width / 2;
  const halfH = tabRect.height / 2;
  switch (location.getName()) {
    case "left":
      return { left: tabRect.left, top: tabRect.top, width: halfW, height: tabRect.height };
    case "right":
      return { left: tabRect.left + halfW, top: tabRect.top, width: halfW, height: tabRect.height };
    case "top":
      return { left: tabRect.left, top: tabRect.top, width: tabRect.width, height: halfH };
    case "bottom":
      return { left: tabRect.left, top: tabRect.top + halfH, width: tabRect.width, height: halfH };
    default:
      return {
        left: tabRect.left,
        top: tabRect.top,
        width: tabRect.width,
        height: tabRect.height,
      };
  }
}

export function readFlexlayoutOutlineRect(): TabDropPreview["rect"] | null {
  const outline = document.querySelector<HTMLElement>(
    ".layout-host-item--active .flexlayout__outline_rect, .layout-host-item--active .flexlayout__outline_rect_edge",
  );
  if (!outline || outline.style.visibility === "hidden") return null;
  const r = outline.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function resolveTabDropTarget(x: number, y: number): TabDropPreview | null {
  if (isOverPaneTabStrip(x, y)) return null;
  return resolveTabDropPreviewByGeometry(x, y);
}

/** Pane strip drag — flexlayout already computed the drop rect; prefer that
 *  over elementFromPoint (blocked by flexlayout__layout_overlay). */
export function resolvePaneDragDropPreview(x: number, y: number): TabDropPreview | null {
  const flexRect = readFlexlayoutOutlineRect();
  if (flexRect) {
    const isFrame = flexRect.width > 8 && flexRect.height > 8;
    return {
      targetTabNodeId: "",
      location: isFrame ? DockLocation.CENTER : DockLocation.LEFT,
      rect: flexRect,
    };
  }

  const geom = resolveTabDropPreviewByGeometry(x, y);
  if (geom) return geom;

  return resolveTabDropTarget(x, y);
}
