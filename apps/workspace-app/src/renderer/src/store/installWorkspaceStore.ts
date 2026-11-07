import { getWorkspaceState, onWorkspaceUpdated } from "../electron";
import { subscribeOptimisticWorkspaceTab } from "../interaction/optimisticWorkspaceTab";
import { syncInteractionCoordinatorWorkspaceTab } from "../interaction/syncInteractionCoordinatorWorkspaceTab";
import { useWorkspaceStore } from "./workspaceStore";

let coordinatorBridgeInstalled = false;

export function installWorkspaceStoreCoordinatorBridge(): void {
  if (coordinatorBridgeInstalled) return;
  coordinatorBridgeInstalled = true;

  useWorkspaceStore.subscribe(
    (state) => state.activeTabId,
    (activeTabId, prevActiveTabId) => {
      if (activeTabId === prevActiveTabId) return;
      syncInteractionCoordinatorWorkspaceTab("store-active-tab");
    },
  );

  subscribeOptimisticWorkspaceTab(() => {
    syncInteractionCoordinatorWorkspaceTab("optimistic-tab");
  });
}

let initPromise: Promise<() => void> | null = null;

export async function initWorkspaceStore(): Promise<() => void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    installWorkspaceStoreCoordinatorBridge();
    const ws = await getWorkspaceState();
    useWorkspaceStore.getState().hydrateFromWorkspace(ws);
    syncInteractionCoordinatorWorkspaceTab("hydrate");
    return onWorkspaceUpdated((next) => {
      useWorkspaceStore.getState().hydrateFromWorkspace(next);
      syncInteractionCoordinatorWorkspaceTab("workspace-updated");
    });
  })();
  return initPromise;
}
