import type { Action, Model } from "flexlayout-react";
import { Actions, TabNode } from "flexlayout-react";
import type { PaneGroupConfig } from "./paneTypes";
import { captureScrollState } from "../lib/pane-manager/pane-scroll";
import { scheduleSplitScrollRestore } from "../lib/pane-manager/pane-split-scroll";
import { getRegisteredTerminalPane } from "../lib/pane-manager/pane-terminal-registry";
import { disposeWebgl } from "../lib/pane-manager/pane-webgl-renderer";
import { reattachWebglIfNeeded } from "../lib/pane-manager/pane-webgl-reattach";
import type { ManagedPaneInternal, ScrollState } from "../lib/pane-manager/pane-manager-types";

type PendingSplitCapture = { scrollState: ScrollState; hadWebgl: boolean };

// Why: flexlayout physically reparents a pane group's DOM (appendChild) on
// an edge-drop MOVE_NODE, which resets xterm's viewport scrollTop — same
// as Orca's wrapInSplit. Capture happens before the model action is
// applied; restore is scheduled once flexlayout's own re-render has had a
// chance to run the reparent.
const pendingCaptures = new Map<number, PendingSplitCapture>();

function terminalIdsForNode(model: Model, nodeId: string): number[] {
  const node = model.getNodeById(nodeId);
  if (!(node instanceof TabNode)) {
    return [];
  }
  const config = (node.getConfig() ?? { tabs: [] }) as PaneGroupConfig;
  return config.tabs
    .filter((tab) => tab.kind === "terminal" && typeof tab.terminalId === "number")
    .map((tab) => tab.terminalId as number);
}

/** Call before returning a MOVE_NODE action that will physically reparent
 * DOM (edge drop — a center drop only swaps tab configs, no DOM move). */
export function captureSplitScrollStateBeforeMove(model: Model, action: Action): void {
  if (action.type !== Actions.MOVE_NODE || action.data.location === "center") {
    return;
  }
  for (const terminalId of terminalIdsForNode(model, action.data.fromNode)) {
    const pane = getRegisteredTerminalPane(terminalId);
    if (!pane) {
      continue;
    }
    const scrollState = captureScrollState(pane.terminal);
    pane.pendingSplitScrollState = scrollState;
    const hadWebgl = !!pane.webglAddon;
    if (hadWebgl) {
      // Why: DOM reparenting can silently invalidate a WebGL context
      // without firing contextlost — dispose before the move, reattach
      // after settle (mirrors Orca's wrapInSplit split handling).
      disposeWebgl(pane);
    }
    pendingCaptures.set(terminalId, { scrollState, hadWebgl });
  }
}

/** Call after the model change resulting from a captured move has been
 * applied — schedules the deferred scroll (and WebGL) restore. */
export function restorePendingSplitScrollStates(): void {
  if (pendingCaptures.size === 0) {
    return;
  }
  const captures = Array.from(pendingCaptures.entries());
  pendingCaptures.clear();
  for (const [terminalId, { scrollState, hadWebgl }] of captures) {
    scheduleSplitScrollRestore(
      getRegisteredTerminalPane,
      terminalId,
      scrollState,
      () => !getRegisteredTerminalPane(terminalId),
      hadWebgl ? (pane: ManagedPaneInternal) => reattachWebglIfNeeded(pane) : undefined,
    );
  }
}
