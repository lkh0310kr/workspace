import {
  getActiveBrowserWebview,
  getBrowserWebviewByWebContentsId,
} from "../layout/activeBrowserWebview";

/** Ported from ref-proj/orca browser-page-zoom — adapted to setZoomFactor (not zoom level). */
export const BROWSER_ZOOM_MIN = 0.5;
export const BROWSER_ZOOM_MAX = 3;
export const BROWSER_ZOOM_STEP = 0.1;

export type BrowserZoomDirection = "in" | "out";

export const WORKSPACE_BROWSER_ZOOM_EVENT = "workspace:browser-zoom";

function clampZoom(value: number): number {
  return Math.min(BROWSER_ZOOM_MAX, Math.max(BROWSER_ZOOM_MIN, value));
}

type ZoomPersistHandler = (factor: number) => void;
const persistHandlers = new Map<string, ZoomPersistHandler>();

export function registerBrowserZoomPersist(
  tabItemId: string,
  handler: ZoomPersistHandler,
): () => void {
  persistHandlers.set(tabItemId, handler);
  return () => persistHandlers.delete(tabItemId);
}

function readZoomFactor(webview: Electron.WebviewTag): number {
  try {
    return webview.getZoomFactor();
  } catch {
    return 1;
  }
}

export function applyBrowserZoomToWebview(
  webview: Electron.WebviewTag,
  direction: BrowserZoomDirection,
): number | null {
  try {
    const current = readZoomFactor(webview);
    const next = clampZoom(
      current + (direction === "in" ? BROWSER_ZOOM_STEP : -BROWSER_ZOOM_STEP),
    );
    if (next === current) return next;
    webview.setZoomFactor(next);
    const tabItemId = webview.dataset.tabItemId;
    if (tabItemId) persistHandlers.get(tabItemId)?.(next);
    return next;
  } catch {
    return null;
  }
}

export function zoomBrowserWebview(
  direction: BrowserZoomDirection,
  webContentsId?: number,
): void {
  const webview =
    webContentsId != null
      ? (getBrowserWebviewByWebContentsId(webContentsId) ?? getActiveBrowserWebview())
      : getActiveBrowserWebview();
  if (!webview) return;
  applyBrowserZoomToWebview(webview, direction);
}

export function dispatchLocalBrowserZoom(direction: BrowserZoomDirection): void {
  window.dispatchEvent(
    new CustomEvent(WORKSPACE_BROWSER_ZOOM_EVENT, { detail: { direction } }),
  );
}

export function addBrowserZoomEventListener(
  callback: (detail: { direction: BrowserZoomDirection }) => void,
): () => void {
  const listener = (event: Event): void => {
    callback((event as CustomEvent<{ direction: BrowserZoomDirection }>).detail);
  };
  window.addEventListener(WORKSPACE_BROWSER_ZOOM_EVENT, listener);
  return () => window.removeEventListener(WORKSPACE_BROWSER_ZOOM_EVENT, listener);
}
