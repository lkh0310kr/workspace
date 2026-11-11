import { useEffect, useRef, useState } from "react";
import { openCadViewerFile } from "../electron";

interface Props {
  tabId: number;
  filePath: string;
  paneActive: boolean;
}

export function CadViewerContent({ tabId, filePath, paneActive }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setError(null);
    setViewerUrl(null);

    openCadViewerFile(tabId, filePath)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setPhase("error");
          setError(result.error);
          return;
        }
        setViewerUrl(result.url);
        setPhase("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase("error");
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [tabId, filePath]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || phase !== "ready" || !viewerUrl) return;

    host.replaceChildren();
    const webview = document.createElement("webview") as Electron.WebviewTag;
    webview.setAttribute("partition", "persist:cad-viewer");
    webview.setAttribute("src", viewerUrl);
    webview.setAttribute("allowpopups", "");
    webview.setAttribute("webpreferences", "contextIsolation=yes,webgl=yes");
    webview.style.display = "flex";
    webview.style.flex = "1";
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.border = "none";
    webview.style.background = "#0f1115";
    webview.style.pointerEvents = paneActive ? "auto" : "none";
    host.appendChild(webview);
    webviewRef.current = webview;

    return () => {
      webviewRef.current = null;
      host.replaceChildren();
    };
  }, [phase, viewerUrl, paneActive]);

  return (
    <div className="file-viewer cad-viewer">
      {phase === "loading" ? (
        <div className="file-viewer-empty">Starting CAD Viewer…</div>
      ) : phase === "error" ? (
        <div className="file-viewer-empty">
          <div>{error ?? "Couldn't open CAD Viewer"}</div>
          <p className="cad-viewer-hint">Run from repo root: npm run agents:python:setup</p>
        </div>
      ) : (
        <div ref={hostRef} className="cad-viewer-host" />
      )}
    </div>
  );
}
