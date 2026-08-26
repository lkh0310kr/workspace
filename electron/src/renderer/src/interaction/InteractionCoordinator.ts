/**
 * Overlay blocks + workspace-tab scope for native embeds (<webview>).
 * Pane/tab visibility is owned by PaneGroup + BrowserContent — not duplicated here.
 */

import { dbgLog, collectWebviews } from "./interactionDebugLog";

export type OverlaySource = string;

type WebviewRegistration = {
  webview: Electron.WebviewTag;
  workspaceTabId: number;
  paneNodeId: string;
  paneTabItemId: string;
  paneVisible: boolean;
};

type PortalRegistration = {
  dismiss: () => void;
};

export type InteractionSnapshot = {
  overlayBlockCount: number;
  overlaySources: OverlaySource[];
  activeWorkspaceTabId: number | null;
  portalIds: string[];
  registeredWebviewCount: number;
  lastReconcileReason: string;
  lastReconcileAt: number;
};

type Listener = () => void;

class InteractionCoordinatorImpl {
  private overlayStack: OverlaySource[] = [];
  private activeWorkspaceTabId: number | null = null;
  /** Electron guests paint above all DOM — in split layout only one pane's
   *  webview may be live at a time. Set explicitly on pane tab click. */
  private activeBrowserPaneNodeId: string | null = null;
  private webviews = new Map<Electron.WebviewTag, WebviewRegistration>();
  private portals = new Map<string, PortalRegistration>();
  private pendingFocusWebview: Electron.WebviewTag | null = null;
  private lastReconcileReason = "init";
  private lastReconcileAt = 0;
  private listeners = new Set<Listener>();

  pushOverlayBlock(source: OverlaySource): void {
    this.overlayStack.push(source);
    this.reconcile(`overlay-push:${source}`);
  }

  popOverlayBlock(source: OverlaySource): void {
    const idx = this.overlayStack.lastIndexOf(source);
    if (idx >= 0) {
      this.overlayStack.splice(idx, 1);
    } else if (this.overlayStack.length > 0) {
      this.overlayStack.pop();
    }
    this.reconcile(`overlay-pop:${source}`);
  }

  clearOverlayBlocks(reason = "overlay-clear"): void {
    if (this.overlayStack.length === 0) return;
    this.overlayStack = [];
    this.reconcile(reason);
  }

  isOverlayBlocked(): boolean {
    return this.overlayStack.length > 0;
  }

  setActiveWorkspaceTab(tabId: number, options?: { force?: boolean }): void {
    const same = this.activeWorkspaceTabId === tabId;
    if (same && !options?.force) {
      return;
    }
    if (!same) {
      this.moveFocusFromEmbeds();
      this.activeWorkspaceTabId = tabId;
      this.activeBrowserPaneNodeId = null;
    }
    this.reconcile(
      same ? `active-workspace-tab-force:${tabId}` : `active-workspace-tab:${tabId}`,
    );
  }

  setActiveBrowserPane(paneNodeId: string): void {
    if (this.activeBrowserPaneNodeId === paneNodeId) return;
    this.activeBrowserPaneNodeId = paneNodeId;
    this.reconcile(`active-browser-pane:${paneNodeId}`);
  }

  registerWebview(
    webview: Electron.WebviewTag,
    info: {
      workspaceTabId: number;
      paneNodeId: string;
      paneTabItemId: string;
      initialPaneVisible?: boolean;
    },
  ): void {
    this.webviews.set(webview, {
      webview,
      workspaceTabId: info.workspaceTabId,
      paneNodeId: info.paneNodeId,
      paneTabItemId: info.paneTabItemId,
      paneVisible: info.initialPaneVisible ?? false,
    });
    if (info.initialPaneVisible && this.activeBrowserPaneNodeId === null) {
      this.activeBrowserPaneNodeId = info.paneNodeId;
    }
    this.reconcile(`register-webview:${info.paneTabItemId}`);
  }

  unregisterWebview(webview: Electron.WebviewTag): void {
    if (!this.webviews.delete(webview)) return;
    this.reconcile("unregister-webview");
  }

  setBrowserPaneVisible(workspaceTabId: number, paneTabItemId: string, visible: boolean): void {
    let changed = false;
    for (const reg of this.webviews.values()) {
      if (reg.workspaceTabId === workspaceTabId && reg.paneTabItemId === paneTabItemId) {
        if (reg.paneVisible !== visible) {
          reg.paneVisible = visible;
          changed = true;
        }
      }
    }
    if (!changed) return;
    this.reconcile(`browser-pane-visible:${paneTabItemId}:${visible}`);
    if (visible) {
      const reg = this.findRegistration(workspaceTabId, paneTabItemId);
      if (reg && this.activeBrowserPaneNodeId === null) {
        this.activeBrowserPaneNodeId = reg.paneNodeId;
      }
      const wv = this.findWebview(workspaceTabId, paneTabItemId);
      if (wv && this.shouldEnableWebview(wv)) {
        this.pendingFocusWebview = wv;
        this.reconcile(`browser-pane-focus:${paneTabItemId}`);
      }
    } else {
      this.blurWebviewIfFocused(workspaceTabId, paneTabItemId);
    }
  }

  registerPortal(id: string, dismiss: () => void): () => void {
    this.portals.set(id, { dismiss });
    this.notifyListeners();
    return () => {
      this.portals.delete(id);
      this.notifyListeners();
    };
  }

  dismissAllPortals(): void {
    document.querySelectorAll(".popover-catcher").forEach((el) => el.remove());
    for (const portal of this.portals.values()) {
      portal.dismiss();
    }
    this.notifyListeners();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): InteractionSnapshot {
    return {
      overlayBlockCount: this.overlayStack.length,
      overlaySources: [...this.overlayStack],
      activeWorkspaceTabId: this.activeWorkspaceTabId,
      portalIds: [...this.portals.keys()],
      registeredWebviewCount: this.webviews.size,
      lastReconcileReason: this.lastReconcileReason,
      lastReconcileAt: this.lastReconcileAt,
    };
  }

  reconcile(reason = "manual"): void {
    this.lastReconcileReason = reason;
    this.lastReconcileAt = Date.now();
    const blocked = this.overlayStack.length > 0;
    const activeTab = this.activeWorkspaceTabId;

    for (const [webview, reg] of this.webviews) {
      const enabled = this.shouldEnableWebview(webview, reg, activeTab, blocked);
      this.applyWebviewPolicy(webview, enabled);
    }

    for (const el of document.querySelectorAll("webview")) {
      const wv = el as Electron.WebviewTag;
      if (this.webviews.has(wv)) continue;
      const hostItem = wv.closest("[data-workspace-tab-id]");
      const tabId = hostItem ? Number(hostItem.getAttribute("data-workspace-tab-id")) : NaN;
      const enabled = Number.isFinite(tabId) && tabId === activeTab && !blocked;
      this.applyWebviewPolicy(wv, enabled);
    }

    if (this.pendingFocusWebview) {
      const wv = this.pendingFocusWebview;
      this.pendingFocusWebview = null;
      const reg = this.webviews.get(wv);
      if (reg && this.shouldEnableWebview(wv, reg, activeTab, blocked)) {
        try {
          wv.focus();
        } catch {
          /* webview may be mid-teardown */
        }
      }
    }

    this.notifyListeners();

    // #region agent log
    const webviewPolicy: Array<Record<string, unknown>> = [];
    for (const [webview, reg] of this.webviews) {
      const enabled = this.shouldEnableWebview(webview, reg, activeTab, blocked);
      webviewPolicy.push({
        itemId: reg.paneTabItemId,
        wsTab: reg.workspaceTabId,
        paneVisible: reg.paneVisible,
        enabled,
        applied: webview.style.pointerEvents,
        display: webview.style.display,
      });
    }
    dbgLog(
      "InteractionCoordinator:reconcile",
      reason,
      {
        reason,
        blocked,
        activeTab,
        activeBrowserPaneNodeId: this.activeBrowserPaneNodeId,
        overlayStack: [...this.overlayStack],
        portalCount: this.portals.size,
        webviewPolicy,
        domWebviews: collectWebviews(),
      },
      blocked ? "H1" : "H6",
    );
    // #endregion
  }

  private applyWebviewPolicy(webview: Electron.WebviewTag, enabled: boolean): void {
    webview.style.pointerEvents = enabled ? "auto" : "none";
    // Native guests ignore z-index — display:none is the only reliable hide.
    webview.style.display = enabled ? "flex" : "none";
  }

  private shouldEnableWebview(
    webview: Electron.WebviewTag,
    reg?: WebviewRegistration,
    activeTab = this.activeWorkspaceTabId,
    blocked = this.overlayStack.length > 0,
  ): boolean {
    const registration = reg ?? this.webviews.get(webview);
    if (!registration) return false;
    if (activeTab !== registration.workspaceTabId || blocked || !registration.paneVisible) {
      return false;
    }
    const activePane = this.activeBrowserPaneNodeId;
    if (!activePane) return true;
    return registration.paneNodeId === activePane;
  }

  private findRegistration(
    workspaceTabId: number,
    paneTabItemId: string,
  ): WebviewRegistration | null {
    for (const reg of this.webviews.values()) {
      if (reg.workspaceTabId === workspaceTabId && reg.paneTabItemId === paneTabItemId) {
        return reg;
      }
    }
    return null;
  }

  private findWebview(workspaceTabId: number, paneTabItemId: string): Electron.WebviewTag | null {
    for (const reg of this.webviews.values()) {
      if (reg.workspaceTabId === workspaceTabId && reg.paneTabItemId === paneTabItemId) {
        return reg.webview;
      }
    }
    return null;
  }

  private blurWebviewIfFocused(workspaceTabId: number, paneTabItemId: string): void {
    const wv = this.findWebview(workspaceTabId, paneTabItemId);
    if (!wv) return;
    const active = document.activeElement;
    if (active === wv || active?.closest?.("webview") === wv) {
      this.moveFocusFromEmbeds();
    }
  }

  private moveFocusFromEmbeds(): void {
    const active = document.activeElement;
    if (!active) return;
    if (active.tagName === "WEBVIEW" || active.closest("webview")) {
      const titlebar = document.querySelector(".titlebar");
      if (titlebar instanceof HTMLElement) {
        titlebar.focus({ preventScroll: true });
      }
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) listener();
  }
}

export const interactionCoordinator = new InteractionCoordinatorImpl();

if (typeof window !== "undefined") {
  window.addEventListener(
    "mouseup",
    () => {
      if (!interactionCoordinator.isOverlayBlocked()) return;
      if (interactionCoordinator.getSnapshot().portalIds.length > 0) return;
      interactionCoordinator.clearOverlayBlocks("overlay-mouseup-safety");
    },
    true,
  );
}
