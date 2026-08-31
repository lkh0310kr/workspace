import { useCallback } from "react";
import {
  Actions,
  type Action,
  type BorderNode,
  type Model,
  type TabNode,
  type TabSetNode,
} from "flexlayout-react";
import { PaneErrorBoundary } from "../components/PaneErrorBoundary";
import { addPaneToTabSet } from "../layout/layoutActions";
import { layoutLogModel } from "../layout/layoutDebugLog";
import { countLayoutTabs } from "../layout/layoutModelParse";
import {
  interceptMoveNodeAction,
  rebalanceAfterPaneDrag,
  summarizeBeforeModelChange,
} from "../layout/layoutMovePolicy";
import { registerLayoutController, getLayoutRefCallback } from "../layout/layoutRef";
import { restorePendingSplitScrollStates } from "../layout/layoutSplitScrollRestore";
import { PaneGroup } from "../panes/PaneGroup";
import { useWorkspaceStore } from "../store/workspaceStore";

const LAYOUT_STRUCTURE_ACTIONS = new Set<string>([
  Actions.ADD_TAB,
  Actions.MOVE_NODE,
  Actions.DELETE_TAB,
  Actions.DELETE_TABSET,
]);

export function useLayoutHostCallbacks() {
  const persistLayout = useWorkspaceStore((s) => s.persistLayout);
  const getModel = useWorkspaceStore((s) => s.getModel);
  const setPendingRebalance = useWorkspaceStore((s) => s.setPendingRebalance);
  const takePendingRebalance = useWorkspaceStore((s) => s.takePendingRebalance);
  const markEnsureInflight = useWorkspaceStore((s) => s.markEnsureInflight);
  const clearEnsureInflight = useWorkspaceStore((s) => s.clearEnsureInflight);

  const bumpLayout = useCallback(
    (tabId: number) => {
      const model = getModel(tabId);
      if (model) persistLayout(tabId, model);
    },
    [getModel, persistLayout],
  );

  const ensureTerminal = useCallback(
    async (tabId: number, model: Model, tabSetId: string) => {
      if (countLayoutTabs(model) > 0 || !markEnsureInflight(tabId)) return;
      try {
        if (countLayoutTabs(model) > 0) return;
        await addPaneToTabSet(model, tabSetId, "markdown");
        if (countLayoutTabs(model) > 0) bumpLayout(tabId);
      } finally {
        clearEnsureInflight(tabId);
      }
    },
    [bumpLayout, markEnsureInflight, clearEnsureInflight],
  );

  const makeFactory = useCallback(
    (tabId: number) => (node: TabNode) => {
      const rootPath = useWorkspaceStore.getState().tabs.find((t) => t.id === tabId)?.root_path ?? "";
      return (
        <PaneErrorBoundary>
          <PaneGroup
            tabNode={node}
            workspaceTabId={tabId}
            rootPath={rootPath}
            onNotifyChanged={() => bumpLayout(tabId)}
          />
        </PaneErrorBoundary>
      );
    },
    [bumpLayout],
  );

  const makeOnAction = useCallback(
    (tabId: number) => (action: Action) => {
      if (action.type === Actions.SELECT_TAB || action.type === Actions.SET_ACTIVE_TABSET) {
        useWorkspaceStore.getState().bumpLayoutRevision(tabId);
        return action;
      }
      if (action.type !== Actions.MOVE_NODE) return action;
      const model = getModel(tabId);
      if (!model) return action;
      const { action: next, pendingRebalanceFromNode } = interceptMoveNodeAction(tabId, model, action);
      if (pendingRebalanceFromNode) setPendingRebalance(tabId, pendingRebalanceFromNode);
      return next;
    },
    [getModel, setPendingRebalance],
  );

  const makeOnRenderTabSet = useCallback(
    (tabId: number) => (tabSetNode: TabSetNode | BorderNode) => {
      const layout = (
        tabSetNode as unknown as {
          getLayout?: () => { getController?: () => Parameters<typeof registerLayoutController>[1] | null };
        }
      ).getLayout?.();
      registerLayoutController(tabId, layout?.getController?.() ?? null);
    },
    [],
  );

  const makeOnModelChange = useCallback(
    (tabId: number) => (_model: Model, action: Action) => {
      const model = getModel(tabId);
      if (!model) return;
      if (LAYOUT_STRUCTURE_ACTIONS.has(action.type)) {
        useWorkspaceStore.getState().bumpLayoutRevision(tabId);
      }
      const before = summarizeBeforeModelChange(model);
      const draggedId = takePendingRebalance(tabId);
      if (draggedId) rebalanceAfterPaneDrag(model, draggedId, tabId);
      layoutLogModel(
        "useLayoutHostCallbacks:onModelChange",
        "model changed",
        model,
        { draggedId: draggedId ?? null, rebalanced: !!draggedId, layoutBefore: before },
        tabId,
      );
      persistLayout(tabId, model);
      // Why: flexlayout's imperative DOM reparent for the just-applied move
      // has run by now; deferred pane restore below tolerates it landing a
      // frame or two later either way.
      restorePendingSplitScrollStates();
    },
    [getModel, takePendingRebalance, persistLayout],
  );

  return {
    bumpLayout,
    ensureTerminal,
    makeFactory,
    makeOnAction,
    makeOnRenderTabSet,
    makeOnModelChange,
    getLayoutRefCallback,
  };
}
