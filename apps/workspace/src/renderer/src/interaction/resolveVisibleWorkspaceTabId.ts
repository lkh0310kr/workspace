import type { TabInfo } from "../electron";
import { getOptimisticWorkspaceTabId } from "./optimisticWorkspaceTab";
import { projectVisibleWorkspaceTabId } from "./workspaceScope";

/** @deprecated Use useWorkspaceScope or projectVisibleWorkspaceTabId instead. */
export function resolveVisibleWorkspaceTabId(
  activeTabId: number,
  coordinatorTabId: number | null,
  tabs: TabInfo[] | undefined,
): number {
  return projectVisibleWorkspaceTabId(
    activeTabId,
    coordinatorTabId,
    getOptimisticWorkspaceTabId(),
    tabs,
  );
}

export { projectVisibleWorkspaceTabId, type WorkspaceScope } from "./workspaceScope";
