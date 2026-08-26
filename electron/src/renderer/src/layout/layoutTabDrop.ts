import { DockLocation } from "flexlayout-react";

const EDGE_RATIO = 0.2;

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
  const line = 2;
  switch (location.getName()) {
    case "left":
      return { left: tabRect.left, top: tabRect.top, width: line, height: tabRect.height };
    case "right":
      return { left: tabRect.right - line, top: tabRect.top, width: line, height: tabRect.height };
    case "top":
      return { left: tabRect.left, top: tabRect.top, width: tabRect.width, height: line };
    case "bottom":
      return { left: tabRect.left, top: tabRect.bottom - line, width: tabRect.width, height: line };
    default:
      return {
        left: tabRect.left,
        top: tabRect.top,
        width: tabRect.width,
        height: tabRect.height,
      };
  }
}

export function resolveTabDropTarget(x: number, y: number): TabDropPreview | null {
  if (isOverPaneTabStrip(x, y)) return null;
  const targetTabNodeId = findTabNodeIdAtPoint(x, y);
  if (!targetTabNodeId) return null;
  const tabEl = document.getElementById(`flexlayout-tab-${targetTabNodeId}`);
  if (!tabEl) return null;
  const tabRect = tabEl.getBoundingClientRect();
  const location = resolveDockLocation(tabRect, x, y);
  return {
    targetTabNodeId,
    location,
    rect: previewRect(tabRect, location),
  };
}
