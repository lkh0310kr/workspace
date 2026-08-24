import { useEffect, useRef, useState } from "react";
import { Actions, TabNode } from "flexlayout-react";
import { PaneFrame } from "../components/PaneFrame";
import { PaneComponent } from "../layout/paneTypes";
import { BROWSER_SESSION_PARTITION } from "../browserSessionPartition";
import { BrowserAddressBar } from "../components/BrowserAddressBar";
import { normalizeBrowserNavigationUrl, BLANK_URL } from "../browserUrl";
import { recordBrowserVisit } from "../browserHistory";

// Port of ui/src/panes/BrowserPane.tsx, rebuilt on top of Orca's actual
// approach (a real Electron <webview> guest, see
// ref-proj/orca/.../browser-page-webview.ts's ensureBrowserPageWebview)
// instead of the Tauri version's native-child-WKWebView + frame-reporting
// IPC protocol (browser.ts's browser_report_frame/browser_hide_all/etc) —
// that whole protocol existed only to work around native child views
// compositing outside the DOM's own stacking order, which doesn't apply
// to a <webview> guest (it composites within normal DOM stacking). Not
// yet porting Orca's full persistent-webview registry (partition-based
// session isolation, paint retention across tab switches, parent-drift
// repair) — this is a direct single-guest-per-pane version, enough to
// prove the layout/tab-rail port end-to-end.
interface Props {
  paneId: string;
  initialUrl?: string;
  tabNode: TabNode;
  component: PaneComponent;
  visible: boolean;
  onSplit: (mode: "split-right" | "split-down", paneType: PaneComponent) => void;
  onTypeChange: (component: PaneComponent) => void;
}

const DEFAULT_URL = "https://www.google.com";

export function BrowserPane({ paneId, initialUrl, tabNode, component, visible, onSplit, onTypeChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  // The address bar's editable text (what the user is typing/sees).
  const [addressInput, setAddressInput] = useState(initialUrl ?? DEFAULT_URL);
  // The webview's actual current URL, updated only on real navigation —
  // separate from addressInput so Escape can revert an in-progress edit
  // without racing whatever's still being typed.
  const [currentUrl, setCurrentUrl] = useState(initialUrl ?? DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const webview = document.createElement("webview") as Electron.WebviewTag;
    // Must be set before `src` — Electron only honors `partition` on a
    // <webview>'s first navigation.
    webview.setAttribute("partition", BROWSER_SESSION_PARTITION);
    webview.setAttribute("src", normalizeBrowserNavigationUrl(initialUrl ?? DEFAULT_URL, false) ?? BLANK_URL);
    webview.setAttribute("allowpopups", "");
    webview.dataset.paneId = paneId;
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.border = "none";
    webview.style.background = "#ffffff";
    container.appendChild(webview);
    webviewRef.current = webview;

    const syncNavState = (): void => {
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };
    const onStartLoading = (): void => setLoading(true);
    const onStopLoading = (): void => {
      setLoading(false);
      syncNavState();
    };
    const onNavigate = (e: Electron.DidNavigateEvent): void => {
      setAddressInput(e.url);
      setCurrentUrl(e.url);
      syncNavState();
    };
    const onNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
      setAddressInput(e.url);
      setCurrentUrl(e.url);
      syncNavState();
    };
    const onPageTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      try {
        recordBrowserVisit(webview.getURL(), e.title);
      } catch {
        // webview can be mid-teardown when this fires.
      }
    };

    webview.addEventListener("did-start-loading", onStartLoading);
    webview.addEventListener("did-stop-loading", onStopLoading);
    webview.addEventListener("did-navigate", onNavigate);
    webview.addEventListener("did-navigate-in-page", onNavigateInPage);
    webview.addEventListener("page-title-updated", onPageTitleUpdated);

    return () => {
      webview.removeEventListener("did-start-loading", onStartLoading);
      webview.removeEventListener("did-stop-loading", onStopLoading);
      webview.removeEventListener("did-navigate", onNavigate);
      webview.removeEventListener("did-navigate-in-page", onNavigateInPage);
      webview.removeEventListener("page-title-updated", onPageTitleUpdated);
      container.removeChild(webview);
      webviewRef.current = null;
    };
    // Deliberately empty deps — created once, navigated imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) webview.style.visibility = visible ? "visible" : "hidden";
  }, [visible]);

  // Cmd+L / Ctrl+L: jump to and select the address bar, real-browser style.
  // Scoped to whichever browser pane(s) are currently visible — if a split
  // has two visible at once this focuses both, which is harmless (only one
  // ends up with real focus).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        addressInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  const navigate = (url: string): void => {
    const normalized = normalizeBrowserNavigationUrl(url, true);
    if (normalized) webviewRef.current?.loadURL(normalized);
  };

  const close = () => {
    tabNode.getModel().doAction(Actions.deleteTab(tabNode.getId()));
  };

  const toolbar = (
    <>
      <div className="browser-nav">
        <button
          type="button"
          className="browser-nav-btn"
          title="Back"
          disabled={!canGoBack}
          onClick={() => webviewRef.current?.goBack()}
        >
          ‹
        </button>
        <button
          type="button"
          className="browser-nav-btn"
          title="Forward"
          disabled={!canGoForward}
          onClick={() => webviewRef.current?.goForward()}
        >
          ›
        </button>
        <button
          type="button"
          className="browser-nav-btn"
          title="Reload"
          onClick={() => webviewRef.current?.reload()}
        >
          ↻
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
        inputRef={addressInputRef}
      />
      {loading ? <div className="browser-loading-bar" aria-hidden="true" /> : null}
    </>
  );

  return (
    <PaneFrame
      component={component}
      tabNode={tabNode}
      toolbar={toolbar}
      contentSlot
      onSplit={onSplit}
      onTypeChange={onTypeChange}
      onClose={close}
    >
      <div ref={containerRef} className="browser-content-slot" />
    </PaneFrame>
  );
}
