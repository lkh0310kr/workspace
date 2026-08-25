import { getWorkspaceState, onWorkspaceUpdated } from "../electron";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { dbgLog } from "../interaction/interactionDebugLog";
import { useWorkspaceStore } from "./workspaceStore";

let coordinatorBridgeInstalled = false;

export function installWorkspaceStoreCoordinatorBridge(): void {
  if (coordinatorBridgeInstalled) return;
  coordinatorBridgeInstalled = true;

  useWorkspaceStore.subscribe(
    (state) => state.activeTabId,
    (activeTabId, prevActiveTabId) => {
      if (activeTabId === prevActiveTabId) return;
      interactionCoordinator.setActiveWorkspaceTab(activeTabId, { force: true });
      dbgLog(
        "workspaceStore:coordinatorBridge",
        "activeTabId changed",
        { from: prevActiveTabId, to: activeTabId },
        "phase2",
      );
    },
  );
}

let initPromise: Promise<() => void> | null = null;

export async function initWorkspaceStore(): Promise<() => void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    installWorkspaceStoreCoordinatorBridge();
    const ws = await getWorkspaceState();
    useWorkspaceStore.getState().hydrateFromWorkspace(ws);
    return onWorkspaceUpdated((next) => {
      useWorkspaceStore.getState().hydrateFromWorkspace(next);
    });
  })();
  return initPromise;
}
