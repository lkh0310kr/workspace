/** Ported from ref-proj/orca browser-page-zoom — adapted to setZoomFactor (not zoom level). */
import type { BrowserWebviewPort } from '../BrowserWebview'
export const BROWSER_ZOOM_MIN = 0.5
export const BROWSER_ZOOM_MAX = 3
export const BROWSER_ZOOM_STEP = 0.1

export type BrowserZoomDirection = 'in' | 'out'

type BrowserZoomListener = (detail: { direction: BrowserZoomDirection }) => void
const browserZoomListeners = new Set<BrowserZoomListener>()

function clampZoom(value: number): number {
  return Math.min(BROWSER_ZOOM_MAX, Math.max(BROWSER_ZOOM_MIN, value))
}

type ZoomPersistHandler = (factor: number) => void
const persistHandlers = new Map<string, ZoomPersistHandler>()

export function registerBrowserZoomPersist(
  tabItemId: string,
  handler: ZoomPersistHandler
): () => void {
  persistHandlers.set(tabItemId, handler)
  return () => persistHandlers.delete(tabItemId)
}

export type BrowserZoomWebview = Pick<
  BrowserWebviewPort,
  'dataset' | 'getZoomFactor' | 'setZoomFactor'
>

function readZoomFactor(webview: BrowserZoomWebview): number {
  try {
    return webview.getZoomFactor()
  } catch {
    return 1
  }
}

export function applyBrowserZoomToWebview(
  webview: BrowserZoomWebview,
  direction: BrowserZoomDirection
): number | null {
  try {
    const current = readZoomFactor(webview)
    const next = clampZoom(current + (direction === 'in' ? BROWSER_ZOOM_STEP : -BROWSER_ZOOM_STEP))
    if (next === current) return next
    webview.setZoomFactor(next)
    const tabItemId = webview.dataset.tabItemId
    if (tabItemId) persistHandlers.get(tabItemId)?.(next)
    return next
  } catch {
    return null
  }
}

export function zoomBrowserWebview(
  direction: BrowserZoomDirection,
  webContentsId: number | undefined,
  resolveWebview: (webContentsId?: number) => BrowserZoomWebview | null
): void {
  const webview = resolveWebview(webContentsId)
  if (!webview) return
  applyBrowserZoomToWebview(webview, direction)
}

export function dispatchLocalBrowserZoom(direction: BrowserZoomDirection): void {
  for (const listener of [...browserZoomListeners]) {
    if (!browserZoomListeners.has(listener)) continue
    listener({ direction })
  }
}

export function addBrowserZoomEventListener(listener: BrowserZoomListener): () => void {
  browserZoomListeners.add(listener)
  return () => browserZoomListeners.delete(listener)
}
