/**
 * Overlay blocks + workspace-tab scope for native embeds (<webview>).
 * Pane/tab visibility is owned by PaneGroup + BrowserContent — not duplicated here.
 */

import { browserFocusLog, snapshotBrowserFocusState } from "../browser/browserFocusDebugLog";
import {
  parkBrowserPageViewport,
} from "../browser/browserPageViewport";
import { focusBrowserGuestWebview } from "../browser/browserGuestFocus";
import {
  getActiveBrowserWebview,
  setActiveBrowserWebview,
  setGuestWebContentsFocus,
} from "../layout/activeBrowserWebview";
import { resolveOrphanWebviewPolicy, resolveWebviewPolicy } from "./webviewPolicy";

const WEBVIEW_FOCUS_MAX_FRAMES = 12;

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

export class InteractionCoordinatorImpl {
  private overlayStack: OverlaySource[] = [];
  private activeWorkspaceTabId: number | null = null;
  private webviews = new Map<Electron.WebviewTag, WebviewRegistration>();
  private portals = new Map<string, PortalRegistration>();
  private pendingFocusWebview: Electron.WebviewTag | null = null;
  private focusScheduleEpoch = new WeakMap<Electron.WebviewTag, number>();
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

  /** Windows: hidden browser guests can keep OS keyboard focus — release before terminal typing. */
  releaseKeyboardFromBrowserGuests(reason: string): void {
    this.pendingFocusWebview = null;
    for (const reg of this.webviews.values()) {
      const webview = reg.webview;
      try {
        webview.blur();
        const webContentsId = webview.getWebContentsId();
        setGuestWebContentsFocus(webContentsId, false);
        void window.api.browser.blurGuest(webContentsId);
      } catch {
        /* guest may be mid-teardown */
      }
    }
    setActiveBrowserWebview(null);
    this.moveFocusFromEmbeds();
    browserFocusLog("InteractionCoordinator.releaseKeyboardFromBrowserGuests", reason, {
      registeredWebviewCount: this.webviews.size,
      ...snapshotBrowserFocusState(getActiveBrowserWebview()),
    });
  }

  setActiveWorkspaceTab(tabId: number, options?: { force?: boolean }): void {
    const same = this.activeWorkspaceTabId === tabId;
    if (same && !options?.force) {
      return;
    }
    const hadEmbedFocus = !same && this.hasWebviewOrGuestFocus();
    if (!same) {
      this.moveFocusFromEmbeds();
      this.activeWorkspaceTabId = tabId;
    }
    this.reconcile(
      same ? `active-workspace-tab-force:${tabId}` : `active-workspace-tab:${tabId}`,
    );
    if (hadEmbedFocus) {
      this.refocusPrimaryBrowserGuest();
    }
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
    const existing = this.webviews.get(webview);
    if (existing) {
      existing.workspaceTabId = info.workspaceTabId;
      existing.paneNodeId = info.paneNodeId;
      existing.paneTabItemId = info.paneTabItemId;
      if (info.initialPaneVisible !== undefined) {
        existing.paneVisible = info.initialPaneVisible;
      }
      if (info.initialChipActive !== undefined) {
        existing.chipActive = info.initialChipActive;
      }
      this.reconcile(`register-webview-update:${info.paneTabItemId}`);
      return;
    }
    const registration: WebviewRegistration = {
      webview,
      workspaceTabId: info.workspaceTabId,
      paneNodeId: info.paneNodeId,
      paneTabItemId: info.paneTabItemId,
      paneVisible: info.initialPaneVisible ?? false,
      chipActive: info.initialChipActive ?? true,
    };
    this.webviews.set(webview, registration);
    if (registration.chipActive && registration.paneVisible) {
      this.pendingFocusWebview = webview;
    }
    this.reconcile(`register-webview:${info.paneTabItemId}`);
  }

  updateWebviewPaneNode(webview: Electron.WebviewTag, paneNodeId: string): void {
    const reg = this.webviews.get(webview);
    if (!reg || reg.paneNodeId === paneNodeId) return;
    reg.paneNodeId = paneNodeId;
  }

  unregisterWebview(webview: Electron.WebviewTag): void {
    const reg = this.webviews.get(webview);
    if (!reg) return;
    this.webviews.delete(webview);
    this.cancelWebviewFocusSchedule(webview);
    if (this.pendingFocusWebview === webview) {
      this.pendingFocusWebview = null;
    }
    parkBrowserPageViewport(reg.paneTabItemId);
    this.reconcile("unregister-webview");
  }

  /** Orca parity — park viewport on chrome unmount without dropping IC registration. */
  detachBrowserWebview(webview: Electron.WebviewTag): void {
    const reg = this.webviews.get(webview);
    if (!reg) return;
    this.cancelWebviewFocusSchedule(webview);
    if (this.pendingFocusWebview === webview) {
      this.pendingFocusWebview = null;
    }
    parkBrowserPageViewport(reg.paneTabItemId);
    this.reconcile("detach-browser-webview");
  }

  setBrowserPaneVisible(workspaceTabId: number, paneTabItemId: string, visible: boolean): void {
    this.setBrowserPaneChipState(workspaceTabId, paneTabItemId, { paneVisible: visible });
  }

  setBrowserChipActive(workspaceTabId: number, paneTabItemId: string, active: boolean): void {
    this.setBrowserPaneChipState(workspaceTabId, paneTabItemId, { chipActive: active });
  }

  /** Single reconcile when pane visibility and chip active change together. */
  setBrowserPaneChipState(
    workspaceTabId: number,
    paneTabItemId: string,
    patch: { paneVisible?: boolean; chipActive?: boolean },
  ): void {
    let changed = false;
    let shouldFocus = false;
    let becameHidden = false;
    let targetPaneNodeId: string | null = null;

    if (patch.chipActive === true) {
      for (const reg of this.webviews.values()) {
        if (reg.workspaceTabId === workspaceTabId && reg.paneTabItemId === paneTabItemId) {
          targetPaneNodeId = reg.paneNodeId;
          break;
        }
      }
      if (targetPaneNodeId) {
        for (const reg of this.webviews.values()) {
          if (
            reg.workspaceTabId === workspaceTabId &&
            reg.paneNodeId === targetPaneNodeId &&
            reg.paneTabItemId !== paneTabItemId &&
            reg.chipActive
          ) {
            reg.chipActive = false;
            changed = true;
          }
        }
      }
    }

    for (const reg of this.webviews.values()) {
      if (reg.workspaceTabId !== workspaceTabId || reg.paneTabItemId !== paneTabItemId) continue;
      const nextPaneVisible = patch.paneVisible ?? reg.paneVisible;
      const nextChipActive = patch.chipActive ?? reg.chipActive;
      const paneBecameVisible = !reg.paneVisible && nextPaneVisible;
      const chipBecameActive = !reg.chipActive && nextChipActive;
      if (reg.paneVisible !== nextPaneVisible) {
        reg.paneVisible = nextPaneVisible;
        changed = true;
      }
      if (reg.chipActive !== nextChipActive) {
        reg.chipActive = nextChipActive;
        changed = true;
      }
      shouldFocus =
        nextPaneVisible && nextChipActive && (paneBecameVisible || chipBecameActive);
      becameHidden = !nextPaneVisible || !nextChipActive;
      break;
    }
    if (!changed) return;
    if (shouldFocus) {
      const wv = this.findWebview(workspaceTabId, paneTabItemId);
      if (wv) this.pendingFocusWebview = wv;
    }
    this.reconcile(`browser-pane-chip:${paneTabItemId}`);
    if (becameHidden) {
      this.blurWebviewIfFocused(workspaceTabId, paneTabItemId);
    }
  }

  requestBrowserGuestFocus(workspaceTabId: number, paneTabItemId: string, reason = "request"): void {
    const wv = this.findWebview(workspaceTabId, paneTabItemId);
    if (!wv) return;
    this.pendingFocusWebview = wv;
    this.reconcile(`browser-focus-request:${reason}`);
  }

  isGuestInteractive(webview: Electron.WebviewTag): boolean {
    const reg = this.webviews.get(webview);
    if (!reg) return false;
    return this.isWebviewInteractive(webview, reg);
  }

  lookupWebviewRegistration(
    webview: Electron.WebviewTag,
  ): Pick<WebviewRegistration, "workspaceTabId" | "paneNodeId" | "paneTabItemId"> | null {
    const reg = this.webviews.get(webview);
    if (!reg) return null;
    return {
      workspaceTabId: reg.workspaceTabId,
      paneNodeId: reg.paneNodeId,
      paneTabItemId: reg.paneTabItemId,
    };
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

    browserFocusLog("InteractionCoordinator.reconcile", reason, {
      blocked,
      portalsOpen,
      activeTab,
      webviewCount: this.webviews.size,
    });

    for (const [, reg] of this.webviews) {
      const base = resolveWebviewPolicy({
        workspaceTabId: reg.workspaceTabId,
        paneVisible: reg.paneVisible,
        chipActive: reg.chipActive,
        activeWorkspaceTabId: activeTab,
        overlayBlocked: blocked,
        portalsOpen,
      });
      this.applyRegistrationPolicy(reg, base);
    }

    for (const el of document.querySelectorAll("webview")) {
      const wv = el as Electron.WebviewTag;
      if (this.webviews.has(wv)) continue;
      const hostItem = wv.closest("[data-workspace-tab-id]");
      const tabIdAttr = hostItem?.getAttribute("data-workspace-tab-id");
      const hostTabId = tabIdAttr !== null && tabIdAttr !== "" ? Number(tabIdAttr) : null;
      const hostWorkspaceTabId = Number.isFinite(hostTabId) ? hostTabId : null;
      this.applyOrphanWebviewPolicy(
        wv,
        resolveOrphanWebviewPolicy(hostWorkspaceTabId, activeTab, blocked, portalsOpen),
      );
    }

    if (this.pendingFocusWebview) {
      const wv = this.pendingFocusWebview;
      this.pendingFocusWebview = null;
      this.scheduleWebviewFocus(wv);
    }

    this.notifyListeners();
  }

  private cancelWebviewFocusSchedule(webview: Electron.WebviewTag): void {
    const next = (this.focusScheduleEpoch.get(webview) ?? 0) + 1;
    this.focusScheduleEpoch.set(webview, next);
  }

  private scheduleWebviewFocus(webview: Electron.WebviewTag): void {
    const epoch = (this.focusScheduleEpoch.get(webview) ?? 0) + 1;
    this.focusScheduleEpoch.set(webview, epoch);
    let attempts = 0;
    const runFocus = (): void => {
      if ((this.focusScheduleEpoch.get(webview) ?? 0) !== epoch) return;
      if (!this.webviews.has(webview)) return;
      if (attempts >= WEBVIEW_FOCUS_MAX_FRAMES) return;
      attempts += 1;
      if (!this.isGuestInteractive(webview)) {
        browserFocusLog("InteractionCoordinator.scheduleWebviewFocus", "guest not interactive yet", {
          attempts,
          ...snapshotBrowserFocusState(webview),
        });
        window.requestAnimationFrame(runFocus);
        return;
      }
      try {
        focusBrowserGuestWebview(webview, `schedule-focus-${attempts}`);
      } catch {
        /* webview may be mid-teardown */
      }
      browserFocusLog("InteractionCoordinator.scheduleWebviewFocus", "focus attempt", {
        attempts,
        ...snapshotBrowserFocusState(webview),
      });
    };
    window.requestAnimationFrame(runFocus);
  }

  private applyRegistrationPolicy(
    reg: WebviewRegistration,
    policy: { visible: boolean; interactive: boolean },
  ): void {
    const webview = reg.webview;
    // Windows: native <webview> composites above DOM siblings — viewport-shell
    // pointer-events:none is not enough; the guest must be locked when inactive.
    webview.style.display = policy.visible ? "flex" : "none";
    webview.style.flex = "1";
    webview.style.pointerEvents = policy.interactive ? "auto" : "none";
    webview.inert = !policy.interactive;
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

  private applyOrphanWebviewPolicy(
    webview: Electron.WebviewTag,
    policy: { visible: boolean; interactive: boolean },
  ): void {
    webview.style.display = policy.visible ? "flex" : "none";
    webview.style.pointerEvents = policy.interactive ? "auto" : "none";
    webview.inert = !policy.interactive;
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

  private hasWebviewOrGuestFocus(): boolean {
    const active = document.activeElement;
    if (active?.tagName === "WEBVIEW" || active?.closest?.("webview")) {
      return true;
    }
    return getActiveBrowserWebview() !== null;
  }

  private refocusPrimaryBrowserGuest(): void {
    const current = getActiveBrowserWebview();
    if (current && this.isWebviewInteractive(current)) {
      this.scheduleWebviewFocus(current);
      return;
    }
    for (const reg of this.webviews.values()) {
      if (reg.workspaceTabId !== this.activeWorkspaceTabId) continue;
      if (!reg.paneVisible || !reg.chipActive) continue;
      if (!this.isWebviewInteractive(reg.webview, reg)) continue;
      this.scheduleWebviewFocus(reg.webview);
      return;
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

  // Native dialogs (window.confirm after TreeView delete) and Alt+Tab can leave
  // a hidden browser guest capturing input on Windows until the window refocuses.
  window.addEventListener("focus", () => {
    interactionCoordinator.reconcile("window-focus");
  });
}
