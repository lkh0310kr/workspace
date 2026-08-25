import type { TabInfo } from "../electron";
import { getOptimisticWorkspaceTabId } from "./optimisticWorkspaceTab";

/**
 * Pane visibility source when workspace IPC and InteractionCoordinator can
 * briefly disagree (rail optimistic switch vs tab close/add).
 */
export function resolveVisibleWorkspaceTabId(
  activeTabId: number,
  coordinatorTabId: number | null,
  tabs: TabInfo[] | undefined,
): number {
  const optimisticTabId = getOptimisticWorkspaceTabId();
  if (optimisticTabId !== null) return optimisticTabId;

  if (coordinatorTabId === null) return activeTabId;
  if (coordinatorTabId === activeTabId) return activeTabId;

  const openIds = new Set(tabs?.map((t) => t.id) ?? []);

  if (!openIds.has(coordinatorTabId)) return activeTabId;
  if (!openIds.has(activeTabId)) return coordinatorTabId;

  // Workspace state is authoritative once both ids are valid open tabs.
  return activeTabId;
}
