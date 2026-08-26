import type { TabInfo } from "../electron";
import { interactionCoordinator } from "./InteractionCoordinator";
import { getOptimisticWorkspaceTabId } from "./optimisticWorkspaceTab";
import { useWorkspaceStore } from "../store/workspaceStore";

export type WorkspaceScope = {
  storeActiveTabId: number;
  coordinatorTabId: number | null;
  optimisticTabId: number | null;
  tabs: TabInfo[];
  visibleWorkspaceTabId: number;
};

/** Project which workspace tab's layout host and panes should be live. */
export function projectVisibleWorkspaceTabId(
  storeActiveTabId: number,
  coordinatorTabId: number | null,
  optimisticTabId: number | null,
  tabs: TabInfo[] | undefined,
): number {
  if (optimisticTabId !== null) return optimisticTabId;

  if (coordinatorTabId === null) return storeActiveTabId;
  if (coordinatorTabId === storeActiveTabId) return storeActiveTabId;

  const openIds = new Set(tabs?.map((t) => t.id) ?? []);

  if (!openIds.has(coordinatorTabId)) return storeActiveTabId;
  if (!openIds.has(storeActiveTabId)) return coordinatorTabId;

  return storeActiveTabId;
}

/** Read a consistent workspace-tab visibility snapshot from all sources. */
export function getWorkspaceScope(): WorkspaceScope {
  const { activeTabId, tabs } = useWorkspaceStore.getState();
  const coordinatorTabId = interactionCoordinator.getSnapshot().activeWorkspaceTabId;
  const optimisticTabId = getOptimisticWorkspaceTabId();
  const visibleWorkspaceTabId = projectVisibleWorkspaceTabId(
    activeTabId,
    coordinatorTabId,
    optimisticTabId,
    tabs,
  );
  return {
    storeActiveTabId: activeTabId,
    coordinatorTabId,
    optimisticTabId,
    tabs,
    visibleWorkspaceTabId,
  };
}
