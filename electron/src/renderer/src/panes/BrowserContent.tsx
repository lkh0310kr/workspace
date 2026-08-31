import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrowserAddressBar } from "../components/BrowserAddressBar";
import { BrowserNavButton } from "../components/BrowserNavButton";
import { BrowserDownloadsBar } from "../components/BrowserDownloadsBar";
import { normalizeBrowserNavigationUrl } from "../browserUrl";
import { recordBrowserVisit } from "../browserHistory";
import { dispatchLocalBrowserZoom, registerBrowserZoomPersist } from "../browser/browserZoom";
import { browserFocusLog, snapshotBrowserFocusState } from "../browser/browserFocusDebugLog";
import { releaseTerminalFocusForBrowser, focusBrowserGuestWebview } from "../browser/browserGuestFocus";
import {
  applyBrowserPageViewportLayout,
  ensureBrowserPageViewport,
  parkBrowserPageViewport,
  syncBrowserPageChromeInset,
} from "../browser/browserPageViewport";
import { ensureBrowserPageWebview } from "../browser/ensureBrowserPageWebview";
import { useBrowserPageSlotViewport } from "../browser/useBrowserPageSlotViewport";
import { useBrowserChromeFocus } from "../browser/useBrowserChromeFocus";
import { useBrowserGuestActivationFocus } from "../browser/useBrowserGuestActivationFocus";
import { useWebviewGuestFocus } from "../browser/useWebviewGuestFocus";
import { onBrowserOpenNewTab } from "../electron";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { setActiveBrowserWebview, getActiveBrowserWebview, registerBrowserWebview } from "../layout/activeBrowserWebview";
import { moveFocusToRendererBeforeFocusedWebviewHidden } from "../layout/browserWebviewRegistry";
import type { PaneTabItem } from "../layout/paneTypes";

interface Props {
  tabId: number;
  paneNodeId: string;
  item: PaneTabItem;
  paneVisible: boolean;
  chipActive: boolean;
  onUpdate: (patch: Partial<PaneTabItem>) => void;
  onOpenNewTab: (url: string) => void;
  onFocusPaneGroup: () => void;
  onSelectPaneTab: (id: string) => void;
}

const DEFAULT_URL = "https://www.google.com";

function browserPagePaneClassName(isActive: boolean, isPaintable: boolean): string {
  if (isActive) return "browser-page-pane browser-page-pane--active";
  if (isPaintable) return "browser-page-pane browser-page-pane--paintable";
  return "browser-page-pane browser-page-pane--hidden";
}

export function BrowserContent({
  tabId,
  paneNodeId,
  item,
  paneVisible,
  chipActive,
  onUpdate,
  onOpenNewTab,
  onFocusPaneGroup,
  onSelectPaneTab,
}: Props) {
  const isActive = paneVisible && chipActive;
  const isPaintable = paneVisible;
  const chipShown = isActive;

  ensureBrowserPageViewport(item.id, paneNodeId);
  const slotViewport = useBrowserPageSlotViewport(paneNodeId);

  const chromeHeaderRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const engineBundleShownRef = useRef(false);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const [addressInput, setAddressInput] = useState(item.url ?? DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(item.url ?? DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [webContentsId, setWebContentsId] = useState<number | null>(null);
  const [rendererGone, setRendererGone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onOpenNewTabRef = useRef(onOpenNewTab);
  onOpenNewTabRef.current = onOpenNewTab;
  const chipShownRef = useRef(chipShown);
  chipShownRef.current = chipShown;
  const isPaintableRef = useRef(isPaintable);
  isPaintableRef.current = isPaintable;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const onFocusPaneGroupRef = useRef(onFocusPaneGroup);
  onFocusPaneGroupRef.current = onFocusPaneGroup;
  const onSelectPaneTabRef = useRef(onSelectPaneTab);
  onSelectPaneTabRef.current = onSelectPaneTab;

  const guestFocus = useWebviewGuestFocus(webviewRef);
  const { keepAddressBarFocusRef } = useBrowserChromeFocus({
    chipShown,
    addressBarInputRef: addressInputRef,
    guestFocus,
  });
  useBrowserGuestActivationFocus({
    isActive: chipShown,
    workspaceTabId: tabId,
    paneTabItemId: item.id,
    webviewRef,
    keepAddressBarFocusRef,
    webviewReady: webContentsId !== null,
  });

  // Orca use-browser-page-webview-url-sync useLayoutEffect
  useLayoutEffect(() => {
    applyBrowserPageViewportLayout(item.id, { paintable: isPaintable, active: isActive });
    const syncChromeInset = (): void => {
      const header = chromeHeaderRef.current;
      if (!header) return;
      syncBrowserPageChromeInset(item.id, header.offsetHeight);
    };
    syncChromeInset();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncChromeInset);
    const header = chromeHeaderRef.current;
    if (header) {
      resizeObserver?.observe(header);
    }
    return () => {
      resizeObserver?.disconnect();
    };
  }, [isActive, isPaintable, item.id, slotViewport]);

  const syncNavState = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    setCanGoBack(webview.canGoBack());
    setCanGoForward(webview.canGoForward());
  }, []);

  const goBack = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview?.canGoBack()) return;
    webview.goBack();
    syncNavState();
  }, [syncNavState]);

  const goForward = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview?.canGoForward()) return;
    webview.goForward();
    syncNavState();
  }, [syncNavState]);

  // Orca attachBrowserPageWebview / use-browser-page-webview-lifecycle
  useEffect(() => {
    if (!slotViewport) return;

    const viewport = ensureBrowserPageViewport(item.id, paneNodeId);
    if (!viewport) return;

    const initialZoom = item.zoomFactor ?? 1;
    const ensured = ensureBrowserPageWebview({
      tabItemId: item.id,
      container: viewport.container,
      initialUrl: item.url ?? DEFAULT_URL,
      initialZoom,
    });
    if (!ensured) return;

    const guest = ensured.webview;
    webviewRef.current = guest;

    applyBrowserPageViewportLayout(item.id, {
      paintable: isPaintableRef.current,
      active: isActiveRef.current,
    });

    try {
      setWebContentsId(guest.getWebContentsId());
    } catch {
      setWebContentsId(null);
    }

    const onStartLoading = (): void => setLoading(true);
    const onStopLoading = (): void => {
      setLoading(false);
      syncNavState();
    };
    const onNavigate = (e: Electron.DidNavigateEvent): void => {
      setAddressInput(e.url);
      setCurrentUrl(e.url);
      onUpdateRef.current({ url: e.url });
      syncNavState();
    };
    const onNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
      setAddressInput(e.url);
      setCurrentUrl(e.url);
      onUpdateRef.current({ url: e.url });
      syncNavState();
    };
    const onPageTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      onUpdateRef.current({ title: e.title });
      try {
        recordBrowserVisit(guest.getURL(), e.title);
      } catch {
        /* guest mid-teardown */
      }
    };
    const onFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent): void => {
      const favicon = e.favicons[0];
      if (favicon) onUpdateRef.current({ favicon });
    };
    const onRendererGone = (): void => setRendererGone(true);
    const onDomReady = (): void => {
      setRendererGone(false);
      setLoadError(null);
      try {
        setWebContentsId(guest.getWebContentsId());
      } catch {
        setWebContentsId(null);
      }
      syncNavState();
      if (chipShownRef.current) {
        interactionCoordinator.requestBrowserGuestFocus(tabId, item.id, "dom-ready");
      }
    };
    const onFailLoad = (e: Electron.DidFailLoadEvent): void => {
      if (!e.validatedURL?.startsWith("workspace-engine:")) return;
      setLoadError(
        "Engine bundle not found. For world-engine.json projects use TreeView → Open in World Engine. For Godot, use Export Godot (Web) & Open.",
      );
    };

    guest.addEventListener("did-start-loading", onStartLoading);
    guest.addEventListener("did-stop-loading", onStopLoading);
    guest.addEventListener("did-navigate", onNavigate);
    guest.addEventListener("did-navigate-in-page", onNavigateInPage);
    guest.addEventListener("page-title-updated", onPageTitleUpdated);
    guest.addEventListener("page-favicon-updated", onFaviconUpdated);
    guest.addEventListener("render-process-gone", onRendererGone);
    guest.addEventListener("dom-ready", onDomReady);
    guest.addEventListener("did-fail-load", onFailLoad);

    const onContainerPointerDown = (): void => {
      onFocusPaneGroupRef.current();
      if (!isActiveRef.current) {
        onSelectPaneTabRef.current(item.id);
        return;
      }
      if (document.activeElement === addressInputRef.current) return;
      browserFocusLog("BrowserContent.viewportPointerDown", "pointer down on guest container");
      setActiveBrowserWebview(guest);
      void focusBrowserGuestWebview(guest, "viewport-pointerdown");
    };
    viewport.container.addEventListener("pointerdown", onContainerPointerDown);

    const unregisterWebview = registerBrowserWebview(guest);
    interactionCoordinator.registerWebview(guest, {
      workspaceTabId: tabId,
      paneNodeId,
      paneTabItemId: item.id,
      initialPaneVisible: paneVisible,
      initialChipActive: chipActive,
    });

    const onFocus = (): void => {
      setActiveBrowserWebview(guest);
      onFocusPaneGroupRef.current();
      browserFocusLog("BrowserContent.webviewFocus", "host webview focus");
    };
    const onBlur = (): void => {
      if (getActiveBrowserWebview() === guest) setActiveBrowserWebview(null);
    };
    guest.addEventListener("focus", onFocus);
    guest.addEventListener("blur", onBlur);

    const unlistenOpenNewTab = onBrowserOpenNewTab(({ hostWebContentsId, url }) => {
      let myId: number;
      try {
        myId = guest.getWebContentsId();
      } catch {
        return;
      }
      if (myId !== hostWebContentsId) return;
      onOpenNewTabRef.current(url);
    });

    return () => {
      guest.removeEventListener("did-start-loading", onStartLoading);
      guest.removeEventListener("did-stop-loading", onStopLoading);
      guest.removeEventListener("did-navigate", onNavigate);
      guest.removeEventListener("did-navigate-in-page", onNavigateInPage);
      guest.removeEventListener("page-title-updated", onPageTitleUpdated);
      guest.removeEventListener("page-favicon-updated", onFaviconUpdated);
      guest.removeEventListener("render-process-gone", onRendererGone);
      guest.removeEventListener("dom-ready", onDomReady);
      guest.removeEventListener("did-fail-load", onFailLoad);
      viewport.container.removeEventListener("pointerdown", onContainerPointerDown);
      guest.removeEventListener("focus", onFocus);
      guest.removeEventListener("blur", onBlur);
      if (getActiveBrowserWebview() === guest) setActiveBrowserWebview(null);
      interactionCoordinator.detachBrowserWebview(guest);
      unregisterWebview();
      unlistenOpenNewTab();
      parkBrowserPageViewport(item.id);
      webviewRef.current = null;
      setWebContentsId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, item.id, paneNodeId, slotViewport, syncNavState]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    interactionCoordinator.updateWebviewPaneNode(webview, paneNodeId);
  }, [paneNodeId]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    applyBrowserPageViewportLayout(item.id, { paintable: isPaintable, active: isActive });

    interactionCoordinator.setBrowserPaneChipState(tabId, item.id, {
      paneVisible,
      chipActive,
    });

    if (chipShown && !engineBundleShownRef.current) {
      engineBundleShownRef.current = true;
      try {
        const url = webview.getURL();
        if (url.startsWith("workspace-engine:")) {
          webview.reload();
        }
      } catch {
        /* not navigated yet */
      }
    }
    if (chipShown) {
      setActiveBrowserWebview(webview);
      releaseTerminalFocusForBrowser();
      interactionCoordinator.requestBrowserGuestFocus(tabId, item.id, "chip-shown");
      browserFocusLog("BrowserContent.chipShown", "chip shown", snapshotBrowserFocusState(webview));
    }
    if (!chipShown) {
      browserFocusLog("BrowserContent.chipHidden", "chip hidden", snapshotBrowserFocusState(webview));
      engineBundleShownRef.current = false;
      addressInputRef.current?.blur();
      moveFocusToRendererBeforeFocusedWebviewHidden();
      if (getActiveBrowserWebview() === webview) {
        setActiveBrowserWebview(null);
      }
    }
  }, [paneVisible, chipActive, chipShown, isPaintable, isActive, tabId, item.id]);

  useEffect(() => {
    return registerBrowserZoomPersist(item.id, (factor) => {
      onUpdateRef.current({ zoomFactor: factor });
    });
  }, [item.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!chipShown) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "=" && e.key !== "+" && e.key !== "-" && e.key !== "_") return;
      e.preventDefault();
      e.stopPropagation();
      dispatchLocalBrowserZoom(e.key === "=" || e.key === "+" ? "in" : "out");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [chipShown]);

  const refocusBrowserGuest = useCallback(() => {
    releaseTerminalFocusForBrowser();
    interactionCoordinator.requestBrowserGuestFocus(tabId, item.id, "address-bar-dismiss");
  }, [tabId, item.id]);

  const navigate = (url: string): void => {
    const normalized = normalizeBrowserNavigationUrl(url, true);
    if (!normalized) return;
    addressInputRef.current?.blur();
    webviewRef.current?.loadURL(normalized);
    if (chipShown) {
      interactionCoordinator.requestBrowserGuestFocus(tabId, item.id, "navigate");
    }
  };

  const handleChromePointerDown = (): void => {
    onFocusPaneGroupRef.current();
    if (!isActiveRef.current) {
      onSelectPaneTabRef.current(item.id);
    }
  };

  return (
    <div
      data-browser-page-pane-id={item.id}
      className={browserPagePaneClassName(isActive, isPaintable)}
      inert={!isActive}
      aria-hidden={!isActive}
    >
      <div
        ref={chromeHeaderRef}
        className="browser-page-chrome-header"
        onPointerDown={handleChromePointerDown}
      >
        <div className="pane-header pane-header-browser">
          <div className="browser-nav">
            <BrowserNavButton
              direction="back"
              disabled={!canGoBack}
              active={chipShown}
              webContentsId={webContentsId}
              onNavigate={syncNavState}
              onNavigateAction={goBack}
            />
            <BrowserNavButton
              direction="forward"
              disabled={!canGoForward}
              active={chipShown}
              webContentsId={webContentsId}
              onNavigate={syncNavState}
              onNavigateAction={goForward}
            />
            <button
              type="button"
              className="browser-nav-btn"
              title={loading ? "Stop" : "Reload"}
              onClick={() => {
                const wv = webviewRef.current;
                if (!wv) return;
                if (loading) wv.stop();
                else wv.reload();
              }}
            >
              {loading ? "×" : "↻"}
            </button>
            <button
              type="button"
              className="browser-nav-btn browser-nav-btn-devtools"
              title="Toggle DevTools"
              onClick={() => {
                const wv = webviewRef.current;
                if (!wv) return;
                if (wv.isDevToolsOpened()) wv.closeDevTools();
                else wv.openDevTools();
              }}
            >
              {"</>"}
            </button>
          </div>
          <BrowserAddressBar
            value={addressInput}
            currentUrl={currentUrl}
            onChange={setAddressInput}
            onNavigate={navigate}
            onDismiss={chipShown ? refocusBrowserGuest : undefined}
            inputRef={addressInputRef}
          />
        </div>
        {loading ? <div className="browser-loading-bar" aria-hidden="true" /> : null}
        <BrowserDownloadsBar webContentsId={webContentsId} />
      </div>
      {rendererGone && chipShown && (
        <div className="browser-crash-banner pointer-events-auto">
          <span>This page crashed.</span>
          <button
            type="button"
            className="browser-crash-reload"
            onClick={() => webviewRef.current?.reload()}
          >
            Reload
          </button>
        </div>
      )}
      {loadError && !rendererGone && chipShown && (
        <div className="browser-crash-banner pointer-events-auto">
          <span>{loadError}</span>
        </div>
      )}
    </div>
  );
}
