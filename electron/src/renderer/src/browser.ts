import { interactionCoordinator } from "./interaction/InteractionCoordinator";

/** Sync webview pointer-events for a workspace tab switch. Prefer
 * interactionCoordinator.setActiveWorkspaceTab — this remains for callers
 * that only need a pointer refresh without changing active tab. */
export function browserSyncPointerEvents(activeWorkspaceTabId: number): void {
  interactionCoordinator.setActiveWorkspaceTab(activeWorkspaceTabId, { force: true });
}

export async function browserHideAll(): Promise<void> {
  for (const el of document.querySelectorAll("webview")) {
    (el as Electron.WebviewTag).style.pointerEvents = "none";
  }
}

export async function browserCleanupAll(): Promise<void> {}
