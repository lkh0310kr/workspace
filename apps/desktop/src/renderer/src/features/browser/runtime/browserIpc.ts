import type { BrowserOpenNewTabEvent } from '@workspace/browser'

/** Desktop IPC adapters for Browser guest and navigation events. */
export function onBrowserOpenNewTab(
  handler: (payload: BrowserOpenNewTabEvent) => void
): () => void {
  return window.api.browser.onOpenNewTab(handler)
}

export function onHtmlFullscreenChanged(handler: (active: boolean) => void): () => void {
  return window.api.browser.onHtmlFullscreenChanged(handler)
}

export function onBrowserReloadShortcut(handler: (payload: { hard: boolean }) => void): () => void {
  return window.api.shortcuts.onBrowserReload(handler)
}

export function onBrowserZoomShortcut(
  handler: (payload: { direction: 'in' | 'out'; webContentsId: number }) => void
): () => void {
  return window.api.shortcuts.onBrowserZoom(handler)
}
