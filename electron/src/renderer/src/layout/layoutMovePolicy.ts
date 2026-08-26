import { Actions, type Action, type Model, TabNode } from "flexlayout-react";
import { layoutLog, layoutLogMutation, summarizeLayoutModel, type LayoutSummary } from "./layoutDebugLog";
import { captureSplitScrollStateBeforeMove } from "./layoutSplitScrollRestore";

export type MoveNodeInterceptResult = {
  /** Pass through to flexlayout, or undefined to cancel the action. */
  action: Action | undefined;
  /** Pane node id to rebalance after flexlayout applies an edge move. */
  pendingRebalanceFromNode: string | null;
};

/**
 * flexlayout MOVE_NODE hook — center drops swap pane configs instead of
 * nesting; edge drops schedule equal-weight rebalance in onModelChange.
 */
export function interceptMoveNodeAction(
  tabId: number,
  model: Model,
  action: Action,
): MoveNodeInterceptResult {
  if (action.type !== Actions.MOVE_NODE) {
    return { action, pendingRebalanceFromNode: null };
  }

  const before = summarizeLayoutModel(model);
  layoutLog(
    "layoutMovePolicy:interceptMoveNodeAction",
    "MOVE_NODE",
    {
      location: action.data.location,
      fromNode: action.data.fromNode,
      toNode: action.data.toNode,
      json: action.data.json,
    },
    tabId,
  );

  if (action.data.location === "center") {
    swapPaneConfigsOnCenterDrop(model, action, tabId);
    layoutLogMutation(
      "layoutMovePolicy:interceptMoveNodeAction",
      "MOVE_NODE center cancelled",
      before,
      summarizeLayoutModel(model),
      { fromNode: action.data.fromNode, toNode: action.data.toNode },
      tabId,
    );
    return { action: undefined, pendingRebalanceFromNode: null };
  }

  layoutLog(
    "layoutMovePolicy:interceptMoveNodeAction",
    "MOVE_NODE edge — pending rebalance",
    { fromNode: action.data.fromNode, location: action.data.location },
    tabId,
  );
  // Why: an edge drop physically reparents the moved pane group's DOM
  // (flexlayout's own moveableElement appendChild), which resets xterm's
  // viewport scrollTop — capture before flexlayout applies the move.
  captureSplitScrollStateBeforeMove(model, action);
  return { action, pendingRebalanceFromNode: action.data.fromNode };
}

function swapPaneConfigsOnCenterDrop(model: Model, action: Action, tabId: number): void {
  let target = model.getNodeById(action.data.toNode);
  if (target?.getType() === "tab") target = target.getParent() ?? undefined;
  const targetTab = target?.getChildren().find((child) => child.getId() !== action.data.fromNode);
  const draggedTab = model.getNodeById(action.data.fromNode);
  if (!(targetTab instanceof TabNode && draggedTab instanceof TabNode) || targetTab.getId() === draggedTab.getId()) {
    return;
  }
  layoutLog(
    "layoutMovePolicy:swapPaneConfigsOnCenterDrop",
    "center swap configs",
    { targetTabId: targetTab.getId(), draggedTabId: draggedTab.getId() },
    tabId,
  );
  const targetAttrs = { component: targetTab.getComponent(), config: targetTab.getConfig() };
  const draggedAttrs = { component: draggedTab.getComponent(), config: draggedTab.getConfig() };
  model.doAction(Actions.updateNodeAttributes(targetTab.getId(), draggedAttrs));
  model.doAction(Actions.updateNodeAttributes(draggedTab.getId(), targetAttrs));
}

export function rebalanceAfterPaneDrag(model: Model, draggedId: string, tabId: number): void {
  layoutLog("layoutMovePolicy:rebalanceAfterPaneDrag", "rebalance after pane drag", { draggedId }, tabId);
  const parent = model.getNodeById(draggedId)?.getParent()?.getParent();
  if (!parent) return;
  model.doAction(Actions.adjustWeights(parent.getId(), parent.getChildren().map(() => 1)));
}

export function summarizeBeforeModelChange(model: Model): LayoutSummary | null {
  return summarizeLayoutModel(model);
}
