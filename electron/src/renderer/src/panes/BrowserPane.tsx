import { useEffect, useRef, useState } from "react";
import { Actions, TabNode } from "flexlayout-react";
import { PaneFrame } from "../components/PaneFrame";
import { PaneComponent } from "../layout/paneTypes";

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

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  if (/^localhost(:\d+)?/.test(trimmed) || /\.[a-z]{2,}$/i.test(trimmed.split("/")[0])) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function BrowserPane({ paneId, initialUrl, tabNode, component, visible, onSplit, onTypeChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [addressInput, setAddressInput] = useState(initialUrl ?? "https://www.google.com");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const webview = document.createElement("webview") as Electron.WebviewTag;
    webview.setAttribute("src", normalizeUrl(initialUrl ?? "https://www.google.com"));
    webview.setAttribute("allowpopups", "");
    webview.dataset.paneId = paneId;
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.border = "none";
    webview.style.background = "#ffffff";
    container.appendChild(webview);
    webviewRef.current = webview;

    const onStartLoading = (): void => setLoading(true);
    const onStopLoading = (): void => setLoading(false);
    const onNavigate = (e: Electron.DidNavigateEvent): void => setAddressInput(e.url);
    const onNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => setAddressInput(e.url);

    webview.addEventListener("did-start-loading", onStartLoading);
    webview.addEventListener("did-stop-loading", onStopLoading);
    webview.addEventListener("did-navigate", onNavigate);
    webview.addEventListener("did-navigate-in-page", onNavigateInPage);

    return () => {
      webview.removeEventListener("did-start-loading", onStartLoading);
      webview.removeEventListener("did-stop-loading", onStopLoading);
      webview.removeEventListener("did-navigate", onNavigate);
      webview.removeEventListener("did-navigate-in-page", onNavigateInPage);
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

  const navigate = (url: string): void => {
    webviewRef.current?.loadURL(normalizeUrl(url));
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
          onClick={() => webviewRef.current?.goBack()}
        >
          ‹
        </button>
        <button
          type="button"
          className="browser-nav-btn"
          title="Forward"
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
      <input
        className="browser-url"
        value={addressInput}
        onChange={(e) => setAddressInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && navigate(addressInput)}
        placeholder="https://..."
        spellCheck={false}
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
