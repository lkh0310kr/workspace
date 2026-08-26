import { interactionCoordinator } from "./InteractionCoordinator";
import { dbgLog } from "./interactionDebugLog";
import { getWorkspaceScope } from "./workspaceScope";

/** Keep IC workspace tab aligned with layout-host visibility projection. */
export function syncInteractionCoordinatorWorkspaceTab(reason: string): void {
  const scope = getWorkspaceScope();
  const { visibleWorkspaceTabId, storeActiveTabId, coordinatorTabId, optimisticTabId } = scope;
  if (coordinatorTabId === visibleWorkspaceTabId) return;
  interactionCoordinator.setActiveWorkspaceTab(visibleWorkspaceTabId, { force: true });
  dbgLog(
    "syncInteractionCoordinatorWorkspaceTab",
    reason,
    {
      visibleWorkspaceTabId,
      storeActiveTabId,
      coordinatorTabId,
      optimisticTabId,
    },
    "phase2",
  );
}
