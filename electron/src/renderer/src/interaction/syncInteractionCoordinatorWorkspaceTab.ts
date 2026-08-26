import { interactionCoordinator } from "./InteractionCoordinator";
import { getWorkspaceScope } from "./workspaceScope";

/** Keep IC workspace tab aligned with layout-host visibility projection. */
export function syncInteractionCoordinatorWorkspaceTab(_reason: string): void {
  const scope = getWorkspaceScope();
  const { visibleWorkspaceTabId, coordinatorTabId } = scope;
  if (coordinatorTabId === visibleWorkspaceTabId) return;
  interactionCoordinator.setActiveWorkspaceTab(visibleWorkspaceTabId, { force: true });
}
