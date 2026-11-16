import { browserInteractionController } from './browserInteractionController'
import {
  destroyBrowserWebview,
  getPersistentBrowserWebview
} from '@renderer/features/browser/host/runtime/browserWebviewRegistry'

/** Release a guest only when its owning Browser tab is explicitly closed. */
export function closeBrowserTab(tabItemId: string): void {
  const webview = getPersistentBrowserWebview(tabItemId)
  if (webview) browserInteractionController.unregisterWebview(webview)
  destroyBrowserWebview(tabItemId)
}
