import type { TabInfo } from "../electron";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { resolveVisibleWorkspaceTabId } from "../interaction/resolveVisibleWorkspaceTabId";
import { useInteractionCoordinatorActiveTab } from "../interaction/useInteractionCoordinatorActiveTab";

/** Workspace tab whose layout host should be visible and interactive. */
export function useVisibleWorkspaceTab(activeTabId: number, tabs: TabInfo[] | undefined): number {
  const coordinatorTabId = useInteractionCoordinatorActiveTab();
  void coordinatorTabId;
  return resolveVisibleWorkspaceTabId(
    activeTabId,
    interactionCoordinator.getSnapshot().activeWorkspaceTabId,
    tabs,
  );
}
