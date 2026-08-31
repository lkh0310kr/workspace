// Orca parity — host-guest/browser-page-viewport.ts (verbatim structure; paneNodeId = Orca workspaceId)

const slotViewportRoots = new Map<string, HTMLDivElement>();

type BrowserPageViewport = {
  shell: HTMLDivElement;
  chromeInset: HTMLDivElement;
  container: HTMLDivElement;
};

const browserPageViewports = new Map<string, BrowserPageViewport>();
const browserPageChromeInsetHeights = new Map<string, number>();
const slotRootListeners = new Map<string, Set<() => void>>();

function notifySlotRootListeners(paneNodeId: string): void {
  for (const listener of slotRootListeners.get(paneNodeId) ?? []) {
    listener();
  }
}

export function registerBrowserOverlaySlotViewport(
  paneNodeId: string,
  element: HTMLDivElement | null,
): void {
  if (element) {
    slotViewportRoots.set(paneNodeId, element);
    notifySlotRootListeners(paneNodeId);
    return;
  }
  slotViewportRoots.delete(paneNodeId);
  notifySlotRootListeners(paneNodeId);
}

export function getBrowserOverlaySlotViewport(paneNodeId: string): HTMLDivElement | null {
  return slotViewportRoots.get(paneNodeId) ?? null;
}

export function subscribeBrowserOverlaySlotViewport(
  paneNodeId: string,
  listener: () => void,
): () => void {
  let listeners = slotRootListeners.get(paneNodeId);
  if (!listeners) {
    listeners = new Set();
    slotRootListeners.set(paneNodeId, listeners);
  }
  const ownedListeners = listeners;
  ownedListeners.add(listener);
  return () => {
    ownedListeners.delete(listener);
    if (ownedListeners.size === 0 && slotRootListeners.get(paneNodeId) === ownedListeners) {
      slotRootListeners.delete(paneNodeId);
    }
  };
}

export function getBrowserPageViewportContainer(tabItemId: string): HTMLDivElement | null {
  return browserPageViewports.get(tabItemId)?.container ?? null;
}

export function ensureBrowserPageViewport(
  tabItemId: string,
  paneNodeId: string,
): BrowserPageViewport | null {
  const root = slotViewportRoots.get(paneNodeId);
  const existing = browserPageViewports.get(tabItemId);
  if (existing) {
    if (!root || existing.shell.parentElement === root) {
      return existing;
    }
    existing.shell.remove();
    browserPageViewports.delete(tabItemId);
  }
  if (!root) {
    return null;
  }

  const shell = document.createElement("div");
  shell.dataset.browserPageViewportId = tabItemId;
  shell.className = "browser-page-viewport-shell";
  shell.style.display = "none";
  shell.inert = true;
  shell.setAttribute("aria-hidden", "true");

  const chromeInset = document.createElement("div");
  chromeInset.dataset.browserPageChromeInset = "";
  chromeInset.className = "browser-page-chrome-inset";
  const rememberedInsetHeight = browserPageChromeInsetHeights.get(tabItemId);
  if (rememberedInsetHeight !== undefined) {
    chromeInset.style.height = `${rememberedInsetHeight}px`;
  }

  const container = document.createElement("div");
  container.dataset.browserPageContainer = "";
  container.className = "browser-page-guest-container";

  shell.append(chromeInset, container);
  root.appendChild(shell);

  const viewport = { shell, chromeInset, container };
  browserPageViewports.set(tabItemId, viewport);
  return viewport;
}

export function removeBrowserPageViewport(tabItemId: string): void {
  const viewport = browserPageViewports.get(tabItemId);
  if (viewport) {
    viewport.shell.remove();
    browserPageViewports.delete(tabItemId);
  }
}

export type BrowserPageViewportLayout = {
  paintable: boolean;
  active: boolean;
};

export function applyBrowserPageViewportLayout(
  tabItemId: string,
  layout: BrowserPageViewportLayout,
): void {
  const viewport = browserPageViewports.get(tabItemId);
  if (!viewport) {
    return;
  }
  if (!layout.paintable) {
    viewport.shell.style.display = "none";
    viewport.shell.inert = true;
    viewport.shell.setAttribute("aria-hidden", "true");
    return;
  }
  viewport.shell.inert = !layout.active;
  if (layout.active) {
    viewport.shell.removeAttribute("aria-hidden");
  } else {
    viewport.shell.setAttribute("aria-hidden", "true");
  }
  viewport.shell.style.display = "flex";
  viewport.shell.style.opacity = layout.active ? "1" : "0";
  viewport.shell.style.pointerEvents = layout.active ? "auto" : "none";
  viewport.shell.style.zIndex = layout.active ? "1" : "0";
}

export function syncBrowserPageChromeInset(tabItemId: string, heightPx: number): void {
  const insetHeight = Math.max(0, heightPx);
  browserPageChromeInsetHeights.set(tabItemId, insetHeight);
  const viewport = browserPageViewports.get(tabItemId);
  if (!viewport) {
    return;
  }
  viewport.chromeInset.style.height = `${insetHeight}px`;
}

export function parkBrowserPageViewport(tabItemId: string): void {
  const viewport = browserPageViewports.get(tabItemId);
  if (viewport) {
    viewport.shell.style.display = "none";
    viewport.shell.inert = true;
    viewport.shell.setAttribute("aria-hidden", "true");
    viewport.shell.style.pointerEvents = "none";
    viewport.shell.style.opacity = "0";
  }
}

/** Test-only */
export function resetBrowserPageViewportsForTests(): void {
  for (const viewport of browserPageViewports.values()) {
    viewport.shell.remove();
  }
  browserPageViewports.clear();
  slotViewportRoots.clear();
  slotRootListeners.clear();
  browserPageChromeInsetHeights.clear();
}
