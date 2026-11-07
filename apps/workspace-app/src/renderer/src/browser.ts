import { syncInteractionCoordinatorWorkspaceTab } from "./interaction/syncInteractionCoordinatorWorkspaceTab";

/** Sync webview pointer-events for the visible workspace tab. */
export function browserSyncPointerEvents(_activeWorkspaceTabId: number): void {
  syncInteractionCoordinatorWorkspaceTab("browser-sync");
}

export async function browserHideAll(): Promise<void> {
  for (const el of document.querySelectorAll("webview")) {
    (el as Electron.WebviewTag).style.pointerEvents = "none";
  }
}

export async function browserCleanupAll(): Promise<void> {}
