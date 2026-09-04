import { dismissWorkspacePortals } from "./workspacePortalDismiss";
import {
  beginOptimisticWorkspaceTabSwitch,
  endOptimisticWorkspaceTabSwitch,
} from "./interaction/optimisticWorkspaceTab";
import { setHomeViewActive } from "./interaction/workspaceHomeView";
import { syncInteractionCoordinatorWorkspaceTab } from "./interaction/syncInteractionCoordinatorWorkspaceTab";
import { selectTab } from "./electron";

export function switchToHome(): void {
  dismissWorkspacePortals();
  endOptimisticWorkspaceTabSwitch();
  setHomeViewActive(true);
  syncInteractionCoordinatorWorkspaceTab("home-switch");
}

export async function switchToWorkspaceTab(tabId: number): Promise<void> {
  dismissWorkspacePortals();
  setHomeViewActive(false);
  beginOptimisticWorkspaceTabSwitch(tabId);
  syncInteractionCoordinatorWorkspaceTab("rail-switch-start");
  try {
    await selectTab(tabId);
  } catch (err) {
    console.error(err);
  } finally {
    endOptimisticWorkspaceTabSwitch();
    syncInteractionCoordinatorWorkspaceTab("rail-switch-finally");
  }
}
