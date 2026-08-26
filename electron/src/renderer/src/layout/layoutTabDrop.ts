import { DockLocation } from "flexlayout-react";

const EDGE_RATIO = 0.2;
const INDICATOR_LINE = 2;

export interface TabDropPreview {
  targetTabNodeId: string;
  location: DockLocation;
  rect: { left: number; top: number; width: number; height: number };
}

function findTabNodeIdAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const tab = el.closest<HTMLElement>("[id^='flexlayout-tab-']");
  if (!tab?.id) return null;
  return tab.id.slice("flexlayout-tab-".length);
}

export function isOverPaneTabStrip(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest(".pane-tab-strip");
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

function previewRect(tabRect: DOMRect, location: DockLocation) {
  switch (location.getName()) {
    case "left":
      return {
        left: tabRect.left,
        top: tabRect.top,
        width: INDICATOR_LINE,
        height: tabRect.height,
      };
    case "right":
      return {
        left: tabRect.right - INDICATOR_LINE,
        top: tabRect.top,
        width: INDICATOR_LINE,
        height: tabRect.height,
      };
    case "top":
      return {
        left: tabRect.left,
        top: tabRect.top,
        width: tabRect.width,
        height: INDICATOR_LINE,
      };
    case "bottom":
      return {
        left: tabRect.left,
        top: tabRect.bottom - INDICATOR_LINE,
        width: tabRect.width,
        height: INDICATOR_LINE,
      };
    default:
      return null;
  }
}

/** flexlayout paints half-pane filled rects — read its hidden outline and
 *  collapse to the same 2px accent line as pane-tab-drop-indicator. */
export function readFlexlayoutDropIndicator(): TabDropPreview["rect"] | null {
  const outline = document.querySelector<HTMLElement>(
    ".layout-host-item--active .flexlayout__outline_rect, .layout-host-item--active .flexlayout__outline_rect_edge",
  );
  if (!outline || outline.style.visibility === "hidden") return null;

  const r = outline.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;

  const isEdge = outline.classList.contains("flexlayout__outline_rect_edge");
  if (!isEdge) return null;

  const layoutRoot = outline.closest(".flexlayout__layout")?.getBoundingClientRect();
  if (!layoutRoot) return null;

  if (r.width >= layoutRoot.width * 0.35 && r.width <= layoutRoot.width * 0.65) {
    if (r.left <= layoutRoot.left + layoutRoot.width * 0.15) {
      return {
        left: r.right - INDICATOR_LINE,
        top: r.top,
        width: INDICATOR_LINE,
        height: r.height,
      };
    }
    return { left: r.left, top: r.top, width: INDICATOR_LINE, height: r.height };
  }

  if (r.height >= layoutRoot.height * 0.35 && r.height <= layoutRoot.height * 0.65) {
    if (r.top <= layoutRoot.top + layoutRoot.height * 0.15) {
      return {
        left: r.left,
        top: r.bottom - INDICATOR_LINE,
        width: r.width,
        height: INDICATOR_LINE,
      };
    }
    return { left: r.left, top: r.top, width: r.width, height: INDICATOR_LINE };
  }

  if (r.width <= 4) {
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  if (r.height <= 4) {
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  return null;
}

export function resolveTabDropTarget(x: number, y: number): TabDropPreview | null {
  if (isOverPaneTabStrip(x, y)) return null;
  const targetTabNodeId = findTabNodeIdAtPoint(x, y);
  if (!targetTabNodeId) return null;
  const tabEl = document.getElementById(`flexlayout-tab-${targetTabNodeId}`);
  if (!tabEl) return null;
  const tabRect = tabEl.getBoundingClientRect();
  const location = resolveDockLocation(tabRect, x, y);
  const rect = previewRect(tabRect, location);
  if (!rect) return null;
  return {
    targetTabNodeId,
    location,
    rect,
  };
}
