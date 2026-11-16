import { getBrowserPageViewportContainer } from './browserPageViewport'

export type GetPersistentBrowserWebview = (tabItemId: string) => Electron.WebviewTag | null

/** True when a guest is missing or detached from its current page container. */
export function browserPageGuestNeedsAttach(
  tabItemId: string,
  webview: Electron.WebviewTag | null,
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
  webviewRef: { current: Electron.WebviewTag | null },
  getPersistentWebview: GetPersistentBrowserWebview
): Electron.WebviewTag | null {
  const container = getBrowserPageViewportContainer(tabItemId)
  const candidates = [webviewRef.current, getPersistentWebview(tabItemId)].filter(
    Boolean
  ) as Electron.WebviewTag[]
  for (const webview of candidates) {
    if (!webview.isConnected) continue
    if (container && webview.parentElement !== container) continue
    webviewRef.current = webview
    return webview
  }
  return null
}
