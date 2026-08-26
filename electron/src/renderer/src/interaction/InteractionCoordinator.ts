/**
 * Overlay blocks + workspace-tab scope for native embeds (<webview>).
 * Pane/tab visibility is owned by PaneGroup + BrowserContent — not duplicated here.
 */

import { resolveOrphanWebviewPolicy, resolveWebviewPolicy } from "./webviewPolicy";

export type OverlaySource = string;

type WebviewRegistration = {
  webview: Electron.WebviewTag;
  workspaceTabId: number;
  paneNodeId: string;
  paneTabItemId: string;
  paneVisible: boolean;
  chipActive: boolean;
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
    }
    this.reconcile(
      same ? `active-workspace-tab-force:${tabId}` : `active-workspace-tab:${tabId}`,
    );
  }

  registerWebview(
    webview: Electron.WebviewTag,
    info: {
      workspaceTabId: number;
      paneNodeId: string;
      paneTabItemId: string;
      initialPaneVisible?: boolean;
      initialChipActive?: boolean;
    },
  ): void {
    this.webviews.set(webview, {
      webview,
      workspaceTabId: info.workspaceTabId,
      paneNodeId: info.paneNodeId,
      paneTabItemId: info.paneTabItemId,
      paneVisible: info.initialPaneVisible ?? false,
      chipActive: info.initialChipActive ?? true,
    });
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
    if (!visible) {
      this.blurWebviewIfFocused(workspaceTabId, paneTabItemId);
    }
  }

  setBrowserChipActive(workspaceTabId: number, paneTabItemId: string, active: boolean): void {
    let changed = false;
    for (const reg of this.webviews.values()) {
      if (reg.workspaceTabId === workspaceTabId && reg.paneTabItemId === paneTabItemId) {
        if (reg.chipActive !== active) {
          reg.chipActive = active;
          changed = true;
        }
      }
    }
    if (!changed) return;
    this.reconcile(`browser-chip-active:${paneTabItemId}:${active}`);
    if (active) {
      const wv = this.findWebview(workspaceTabId, paneTabItemId);
      if (wv && this.isWebviewInteractive(wv)) {
        this.pendingFocusWebview = wv;
        this.reconcile(`browser-chip-focus:${paneTabItemId}`);
      }
    } else {
      this.blurWebviewIfFocused(workspaceTabId, paneTabItemId);
    }
  }

  registerPortal(id: string, dismiss: () => void): () => void {
    this.portals.set(id, { dismiss });
    this.reconcile(`portal-open:${id}`);
    return () => {
      this.portals.delete(id);
      this.reconcile(`portal-close:${id}`);
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
    const portalsOpen = this.portals.size > 0;
    const activeTab = this.activeWorkspaceTabId;

    for (const [webview, reg] of this.webviews) {
      const policy = resolveWebviewPolicy({
        workspaceTabId: reg.workspaceTabId,
        paneVisible: reg.paneVisible,
        chipActive: reg.chipActive,
        activeWorkspaceTabId: activeTab,
        overlayBlocked: blocked,
        portalsOpen,
      });
      this.applyWebviewPolicy(webview, policy);
    }

    for (const el of document.querySelectorAll("webview")) {
      const wv = el as Electron.WebviewTag;
      if (this.webviews.has(wv)) continue;
      const hostItem = wv.closest("[data-workspace-tab-id]");
      const tabIdAttr = hostItem?.getAttribute("data-workspace-tab-id");
      const hostTabId = tabIdAttr !== null && tabIdAttr !== "" ? Number(tabIdAttr) : null;
      const hostWorkspaceTabId = Number.isFinite(hostTabId) ? hostTabId : null;
      this.applyWebviewPolicy(
        wv,
        resolveOrphanWebviewPolicy(hostWorkspaceTabId, activeTab, blocked, portalsOpen),
      );
    }

    if (this.pendingFocusWebview) {
      const wv = this.pendingFocusWebview;
      this.pendingFocusWebview = null;
      const reg = this.webviews.get(wv);
      const policy = reg
        ? resolveWebviewPolicy({
            workspaceTabId: reg.workspaceTabId,
            paneVisible: reg.paneVisible,
            chipActive: reg.chipActive,
            activeWorkspaceTabId: activeTab,
            overlayBlocked: blocked,
            portalsOpen,
          })
        : { visible: false, interactive: false };
      if (policy.interactive) {
        try {
          wv.focus();
        } catch {
          /* webview may be mid-teardown */
        }
      }
    }

    this.notifyListeners();
  }

  private applyWebviewPolicy(
    webview: Electron.WebviewTag,
    policy: { visible: boolean; interactive: boolean },
  ): void {
    webview.style.display = policy.visible ? "flex" : "none";
    webview.style.pointerEvents = policy.interactive ? "auto" : "none";
  }

  private isWebviewInteractive(webview: Electron.WebviewTag, reg?: WebviewRegistration): boolean {
    const registration = reg ?? this.webviews.get(webview);
    if (!registration) return false;
    return resolveWebviewPolicy({
      workspaceTabId: registration.workspaceTabId,
      paneVisible: registration.paneVisible,
      chipActive: registration.chipActive,
      activeWorkspaceTabId: this.activeWorkspaceTabId,
      overlayBlocked: this.overlayStack.length > 0,
      portalsOpen: this.portals.size > 0,
    }).interactive;
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
