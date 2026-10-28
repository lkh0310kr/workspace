import { dismissWorkspacePortals } from "./workspacePortalDismiss";
import {
  beginOptimisticWorkspaceTabSwitch,
  endOptimisticWorkspaceTabSwitch,
} from "./interaction/optimisticWorkspaceTab";
import { setHomeViewActive } from "./interaction/workspaceHomeView";
import { syncInteractionCoordinatorWorkspaceTab } from "./interaction/syncInteractionCoordinatorWorkspaceTab";
import { getWorkspaceScope } from "./interaction/workspaceScope";
import { selectTab } from "./electron";

let workspaceSwitchEpoch = 0;

export function switchToHome(): void {
  dismissWorkspacePortals();
  endOptimisticWorkspaceTabSwitch();
  setHomeViewActive(true);
  syncInteractionCoordinatorWorkspaceTab("home-switch");
}

export async function switchToWorkspaceTab(tabId: number): Promise<void> {
  const scope = getWorkspaceScope();
  if (!scope.homeActive && scope.visibleWorkspaceTabId === tabId) return;
  const epoch = ++workspaceSwitchEpoch;
  dismissWorkspacePortals();
  setHomeViewActive(false);
  beginOptimisticWorkspaceTabSwitch(tabId);
  syncInteractionCoordinatorWorkspaceTab("rail-switch-start");
  try {
    await selectTab(tabId);
  } catch (err) {
    console.error(err);
  } finally {
    // A slower earlier IPC response must not clear a newer optimistic target.
    if (epoch === workspaceSwitchEpoch) {
      endOptimisticWorkspaceTabSwitch();
      syncInteractionCoordinatorWorkspaceTab("rail-switch-finally");
    }
  }
}
