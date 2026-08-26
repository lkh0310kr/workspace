import { useEffect, useState } from "react";
import { getOptimisticWorkspaceTabId, subscribeOptimisticWorkspaceTab } from "./optimisticWorkspaceTab";
import { useInteractionCoordinatorActiveTab } from "./useInteractionCoordinatorActiveTab";
import { getWorkspaceScope, projectVisibleWorkspaceTabId, type WorkspaceScope } from "./workspaceScope";
import { useWorkspaceStore } from "../store/workspaceStore";

/** Reactive workspace tab visibility snapshot for React components. */
export function useWorkspaceScope(): WorkspaceScope {
  const storeActiveTabId = useWorkspaceStore((s) => s.activeTabId);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const coordinatorTabId = useInteractionCoordinatorActiveTab();
  const [, tick] = useState(0);

  useEffect(() => subscribeOptimisticWorkspaceTab(() => tick((n) => n + 1)), []);

  const optimisticTabId = getOptimisticWorkspaceTabId();
  const visibleWorkspaceTabId = projectVisibleWorkspaceTabId(
    storeActiveTabId,
    coordinatorTabId,
    optimisticTabId,
    tabs,
  );

  return {
    storeActiveTabId,
    coordinatorTabId,
    optimisticTabId,
    tabs,
    visibleWorkspaceTabId,
  };
}

/** Non-reactive snapshot — prefer useWorkspaceScope in components. */
export { getWorkspaceScope };
