import { syncInteractionCoordinatorWorkspaceTab } from '../../../interaction/syncInteractionCoordinatorWorkspaceTab'
import { interactionCoordinator } from '../../../interaction/InteractionCoordinator'
import {
  destroyBrowserWebview,
  getPersistentBrowserWebview
} from '@renderer/features/browser/runtime/browserWebviewRegistry'

/** Sync webview pointer-events for the visible workspace tab. */
export function browserSyncPointerEvents(_activeWorkspaceTabId: number): void {
  syncInteractionCoordinatorWorkspaceTab('browser-sync')
}

export async function browserHideAll(): Promise<void> {
  for (const el of document.querySelectorAll('webview')) {
    ;(el as Electron.WebviewTag).style.pointerEvents = 'none'
  }
}

export async function browserCleanupAll(): Promise<void> {}

/** Release a guest only when its owning Browser tab is explicitly closed. */
export function closeBrowserTab(tabItemId: string): void {
  const webview = getPersistentBrowserWebview(tabItemId)
  if (webview) interactionCoordinator.unregisterWebview(webview)
  destroyBrowserWebview(tabItemId)
}
