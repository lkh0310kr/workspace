import { DockLocation, type Model } from "flexlayout-react";
import { layoutLog, layoutLogMutation, summarizeLayoutModel } from "./layoutDebugLog";
import { moveTabToGroup, moveTabToNewPane, moveTabToSplitPane } from "./layoutActions";
import { resolveTabDropTarget } from "./layoutTabDrop";
import type { TabDragPayload } from "./tabDrag";

export type LayoutChipDropDeps = {
  getModel: (tabId: number) => Model | undefined;
  bumpLayout: (tabId: number) => void;
  setActivePaneTab: (workspaceTabId: number, nodeId: string, tabItemId: string) => void;
};

/**
 * Window-level fallback when a tab chip is dropped outside any pane strip.
 * Strip-internal reorder/merge is handled in PaneTabStrip.onDrop.
 */
export function executeTabChipWindowDrop(
  activeTabId: number,
  clientX: number,
  clientY: number,
  payload: TabDragPayload,
  deps: LayoutChipDropDeps,
): boolean {
  const model = deps.getModel(activeTabId);
  if (!model) {
    layoutLog("layoutChipWindowDrop", "no model", { payload }, activeTabId);
    return false;
  }

  const before = summarizeLayoutModel(model);
  const preview = resolveTabDropTarget(clientX, clientY);
  layoutLog(
    "layoutChipWindowDrop",
    "window drop",
    {
      payload,
      preview: preview
        ? { targetTabNodeId: preview.targetTabNodeId, location: preview.location.getName() }
        : null,
      clientX,
      clientY,
    },
    activeTabId,
  );

  let handled = false;
  let handler = "none";

  if (preview) {
    if (preview.location === DockLocation.CENTER && preview.targetTabNodeId !== payload.sourceTabNodeId) {
      handler = "moveTabToGroup";
      const movedId = moveTabToGroup(
        model,
        payload.sourceTabNodeId,
        payload.tabId,
        preview.targetTabNodeId,
        Number.MAX_SAFE_INTEGER,
      );
      if (movedId) {
        deps.setActivePaneTab(activeTabId, preview.targetTabNodeId, movedId);
        handled = true;
      }
    } else if (preview.location !== DockLocation.CENTER) {
      handler = "moveTabToSplitPane";
      const result = moveTabToSplitPane(
        model,
        payload.sourceTabNodeId,
        payload.tabId,
        preview.targetTabNodeId,
        preview.location,
      );
      if (result) {
        deps.setActivePaneTab(activeTabId, result.tabNodeId, result.tabItemId);
        handled = true;
      }
    }
  }

  if (!handled) {
    handler = "moveTabToNewPane";
    const fallback = moveTabToNewPane(model, payload.sourceTabNodeId, payload.tabId);
    if (fallback) {
      deps.setActivePaneTab(activeTabId, fallback.tabNodeId, fallback.tabItemId);
      handled = true;
    }
  }

  layoutLogMutation(
    "layoutChipWindowDrop",
    handled ? "handled" : "unhandled",
    before,
    summarizeLayoutModel(model),
    { handler, handled, payload },
    activeTabId,
  );

  if (handled) deps.bumpLayout(activeTabId);
  return handled;
}
