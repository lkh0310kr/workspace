import { getBrowserPageViewportContainer } from './browserPageViewport'
import type { BrowserWebviewPort } from './BrowserWebview'

export type GetPersistentBrowserWebview = (tabItemId: string) => BrowserWebviewPort | null

/** True when a guest is missing or detached from its current page container. */
export function browserPageGuestNeedsAttach(
  tabItemId: string,
  webview: BrowserWebviewPort | null,
  getPersistentWebview: GetPersistentBrowserWebview
): boolean {
  const container = getBrowserPageViewportContainer(tabItemId)
  if (!container) return true
  const live = webview ?? getPersistentWebview(tabItemId)
  if (!live) return true
  return !live.isConnected || live.parentElement !== container
}

/** Resolve a connected guest when React's ref lags the persistent registry. */
export function resolveBrowserPageWebview(
  tabItemId: string,
  webviewRef: { current: BrowserWebviewPort | null },
  getPersistentWebview: GetPersistentBrowserWebview
): BrowserWebviewPort | null {
  const container = getBrowserPageViewportContainer(tabItemId)
  const candidates = [webviewRef.current, getPersistentWebview(tabItemId)].filter(
    Boolean
  ) as BrowserWebviewPort[]
  for (const webview of candidates) {
    if (!webview.isConnected) continue
    if (container && webview.parentElement !== container) continue
    webviewRef.current = webview
    return webview
  }
  return null
}
