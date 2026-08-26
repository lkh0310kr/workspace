import type { CSSProperties } from "react";

/**
 * Single rule for pane chip content (terminal / browser / editor):
 * workspace+flexlayout pane must be visible AND this chip must be active.
 * Never set visibility:visible on `active` alone — it overrides ancestor hidden.
 */
export function paneChipContentStyle(paneVisible: boolean, chipActive: boolean): CSSProperties {
  const shown = paneVisible && chipActive;
  return {
    visibility: shown ? "visible" : "hidden",
    pointerEvents: shown ? "auto" : "none",
    zIndex: chipActive ? 1 : 0,
  };
}

export function paneChipContentShown(paneVisible: boolean, chipActive: boolean): boolean {
  return paneVisible && chipActive;
}

/** Workspace tab host wrapper — keep mounted, hide inactive tabs. */
export function workspaceTabHostStyle(active: boolean): CSSProperties {
  return {
    visibility: active ? "visible" : "hidden",
    pointerEvents: active ? "auto" : "none",
  };
}
