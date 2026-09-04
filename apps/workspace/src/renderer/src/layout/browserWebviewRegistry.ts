import { removeBrowserPageViewport } from "../browser/browserPageViewport";
import {
  acquireWebviewsDragPassthrough,
  isWebviewDragPassthroughActive,
  registerWebviewDragPassthroughSurface,
} from "./webviewDragPassthrough";

// Why: shared coordination state for every live browser <webview>, kept
// outside BrowserContent so a drag anywhere in the window (a flexlayout
// tab-node move, a PaneTabStrip chip reorder) can make every guest
// pointer-transparent for its duration, not just the one being dragged —
// ported from Orca's webview-registry.ts.
const webviewRegistry = new Map<string, Electron.WebviewTag>();

export type BrowserWebviewMemoryProfile = {
  browserWebviewCount: number;
};

const DRAG_LISTENER_KEY = "__workspaceBrowserDragListeners";
let dragListenersAttached = false;
let nativeDragPassthroughRelease: (() => void) | null = null;
const dragPassthroughPreviousPointerEvents = new Map<Electron.WebviewTag, string>();
const rendererRecoveryPendingTabItemIds = new Set<string>();
const webviewLifecycleListeners = new Map<
  string,
  {
    webview: Electron.WebviewTag;
    onRendererGone: EventListener;
    onRendererReady: EventListener;
    onGuestDestroyed: EventListener;
  }
>();

type DragListenerRegistry = {
  dragstart: () => void;
  dragend: () => void;
  drop: () => void;
};

function getListenerHost(): (Window & { [DRAG_LISTENER_KEY]?: DragListenerRegistry }) | null {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return null;
  }
  return window as Window & { [DRAG_LISTENER_KEY]?: DragListenerRegistry };
}

function removeDragListeners(): void {
  const listenerHost = getListenerHost();
  const existingListeners = listenerHost?.[DRAG_LISTENER_KEY];
  if (!listenerHost || !existingListeners) {
    return;
  }
  window.removeEventListener("dragstart", existingListeners.dragstart, true);
  window.removeEventListener("dragend", existingListeners.dragend, true);
  window.removeEventListener("drop", existingListeners.drop, true);
  delete listenerHost[DRAG_LISTENER_KEY];
  dragListenersAttached = false;
  nativeDragPassthroughRelease?.();
  nativeDragPassthroughRelease = null;
}

function ensureDragListeners(): void {
  const listenerHost = getListenerHost();
  if (!listenerHost) {
    return;
  }
  if (dragListenersAttached && listenerHost[DRAG_LISTENER_KEY]) {
    return;
  }
  removeDragListeners();

  const dragstart = (): void => setWebviewsDragPassthrough(true);
  const dragend = (): void => setWebviewsDragPassthrough(false);
  const drop = (): void => setWebviewsDragPassthrough(false);

  window.addEventListener("dragstart", dragstart, true);
  window.addEventListener("dragend", dragend, true);
  window.addEventListener("drop", drop, true);
  // Why: only live webviews need drag passthrough listeners; removing them
  // when the registry empties keeps browserless workspace tabs free of
  // global hooks.
  listenerHost[DRAG_LISTENER_KEY] = { dragstart, dragend, drop };
  dragListenersAttached = true;
}

export function hasLiveBrowserGuest(tabItemId: string): boolean {
  return webviewRegistry.has(tabItemId);
}

export function getBrowserWebviewMemoryProfile(): BrowserWebviewMemoryProfile {
  return { browserWebviewCount: webviewRegistry.size };
}

function applyWebviewsDragPassthrough(passthrough: boolean): void {
  for (const webview of webviewRegistry.values()) {
    if (passthrough) {
      if (!dragPassthroughPreviousPointerEvents.has(webview)) {
        dragPassthroughPreviousPointerEvents.set(webview, webview.style.pointerEvents);
      }
      webview.style.pointerEvents = "none";
      continue;
    }

    const previous = dragPassthroughPreviousPointerEvents.get(webview);
    if (previous !== undefined) {
      webview.style.pointerEvents = previous;
      dragPassthroughPreviousPointerEvents.delete(webview);
    }
  }
}

registerWebviewDragPassthroughSurface(applyWebviewsDragPassthrough);

export function setWebviewsDragPassthrough(passthrough: boolean): void {
  if (passthrough) {
    if (!nativeDragPassthroughRelease) {
      nativeDragPassthroughRelease = acquireWebviewsDragPassthrough();
    }
    return;
  }

  nativeDragPassthroughRelease?.();
  nativeDragPassthroughRelease = null;
}

function applyCurrentDragPassthroughToWebview(webview: Electron.WebviewTag): void {
  if (!isWebviewDragPassthroughActive()) {
    return;
  }
  if (!dragPassthroughPreviousPointerEvents.has(webview)) {
    dragPassthroughPreviousPointerEvents.set(webview, webview.style.pointerEvents);
  }
  webview.style.pointerEvents = "none";
}

export function registerPersistentWebview(tabItemId: string, webview: Electron.WebviewTag): void {
  const previousListeners = webviewLifecycleListeners.get(tabItemId);
  if (previousListeners) {
    previousListeners.webview.removeEventListener(
      "render-process-gone",
      previousListeners.onRendererGone,
    );
    previousListeners.webview.removeEventListener("dom-ready", previousListeners.onRendererReady);
    previousListeners.webview.removeEventListener("destroyed", previousListeners.onGuestDestroyed);
  }
  const onRendererGone = (): void => {
    rendererRecoveryPendingTabItemIds.add(tabItemId);
  };
  const onRendererReady = (): void => {
    rendererRecoveryPendingTabItemIds.delete(tabItemId);
  };
  const onGuestDestroyed = (): void => {
    // Why: 'destroyed' also fires after an intentional webview.remove(); only
    // a still-attached element means the guest died under a live tab.
    if (webview.isConnected) {
      rendererRecoveryPendingTabItemIds.add(tabItemId);
    }
  };
  webview.addEventListener("render-process-gone", onRendererGone);
  webview.addEventListener("dom-ready", onRendererReady);
  webview.addEventListener("destroyed", onGuestDestroyed);
  webviewLifecycleListeners.set(tabItemId, {
    webview,
    onRendererGone,
    onRendererReady,
    onGuestDestroyed,
  });
  webviewRegistry.set(tabItemId, webview);
  applyCurrentDragPassthroughToWebview(webview);
  ensureDragListeners();
}

export function unregisterPersistentWebview(tabItemId: string): void {
  const webview = webviewRegistry.get(tabItemId);
  const lifecycleListeners = webviewLifecycleListeners.get(tabItemId);
  if (lifecycleListeners) {
    lifecycleListeners.webview.removeEventListener(
      "render-process-gone",
      lifecycleListeners.onRendererGone,
    );
    lifecycleListeners.webview.removeEventListener("dom-ready", lifecycleListeners.onRendererReady);
    lifecycleListeners.webview.removeEventListener("destroyed", lifecycleListeners.onGuestDestroyed);
    webviewLifecycleListeners.delete(tabItemId);
  }
  rendererRecoveryPendingTabItemIds.delete(tabItemId);
  if (webview) {
    dragPassthroughPreviousPointerEvents.delete(webview);
  }
  webviewRegistry.delete(tabItemId);
  if (webviewRegistry.size === 0) {
    removeDragListeners();
  }
}

export function isBrowserPageRendererRecoveryPending(tabItemId: string): boolean {
  return rendererRecoveryPendingTabItemIds.has(tabItemId);
}

export function getPersistentBrowserWebview(tabItemId: string): Electron.WebviewTag | undefined {
  return webviewRegistry.get(tabItemId);
}

const PARK_DESTROY_MS = 400;
let parkHost: HTMLElement | null = null;
const destroyTimers = new Map<string, number>();

function ensureParkHost(): HTMLElement {
  if (!parkHost) {
    parkHost = document.createElement("div");
    parkHost.id = "browser-webview-park";
    parkHost.style.display = "none";
    document.body.appendChild(parkHost);
  }
  return parkHost;
}

/** Keep the guest alive across React remounts; destroy if not reclaimed soon. */
export function parkBrowserWebview(tabItemId: string, webview: Electron.WebviewTag): void {
  moveFocusToRendererBeforeWebviewDetach(webview);
  ensureParkHost().appendChild(webview);
  const existing = destroyTimers.get(tabItemId);
  if (existing !== undefined) {
    window.clearTimeout(existing);
  }
  destroyTimers.set(
    tabItemId,
    window.setTimeout(() => {
      destroyTimers.delete(tabItemId);
      destroyBrowserWebview(tabItemId);
    }, PARK_DESTROY_MS),
  );
}

export function claimParkedBrowserWebview(
  tabItemId: string,
  container: HTMLElement,
): Electron.WebviewTag | null {
  const pending = destroyTimers.get(tabItemId);
  if (pending !== undefined) {
    window.clearTimeout(pending);
    destroyTimers.delete(tabItemId);
  }
  const webview = webviewRegistry.get(tabItemId);
  if (!webview) return null;
  if (webview.parentElement !== container) {
    container.appendChild(webview);
  }
  return webview;
}

export function destroyBrowserWebview(tabItemId: string): void {
  const pending = destroyTimers.get(tabItemId);
  if (pending !== undefined) {
    window.clearTimeout(pending);
    destroyTimers.delete(tabItemId);
  }
  const webview = webviewRegistry.get(tabItemId);
  if (webview?.parentElement) {
    webview.parentElement.removeChild(webview);
  }
  removeBrowserPageViewport(tabItemId);
  unregisterPersistentWebview(tabItemId);
}

function moveFocusToRendererIfWebviewOwnsFocus(webview: Electron.WebviewTag): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) {
    return false;
  }
  // Why: hiding/removing a focused webview can let macOS reactivate the
  // previously-frontmost app. Give focus back to Workspace's renderer first.
  if (webview === activeElement || webview.contains(activeElement)) {
    activeElement.blur?.();
    window.focus();
    return true;
  }
  return false;
}

export function moveFocusToRendererBeforeFocusedWebviewHidden(): void {
  for (const webview of webviewRegistry.values()) {
    if (moveFocusToRendererIfWebviewOwnsFocus(webview)) {
      return;
    }
  }
}

export function moveFocusToRendererBeforeWebviewDetach(webview: Electron.WebviewTag): void {
  moveFocusToRendererIfWebviewOwnsFocus(webview);
}
