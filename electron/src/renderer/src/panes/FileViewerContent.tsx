import { useCallback, useEffect, useState, type WheelEvent } from "react";
import { readFileBinaryPreview } from "../electron";

// v1 of the ideation.md "File Viewer" pane — images and PDFs only, per the
// scoped-down plan. Video/audio/e-book are separate future slices.
//
// Why blob: URLs (Orca parity — editor/useLocalImageSrc.ts): a raw file://
// <img>/<embed> src throws "Not allowed to load local resource" — Chromium
// blocks file:// resource loads from a page not itself loaded via file://,
// which the Vite dev server's http://localhost never is. Reading the bytes
// over IPC and handing the renderer a blob: URL sidesteps that restriction
// entirely and works identically in dev and production.
interface Props {
  tabId: number;
  filePath: string | null;
  treeOpen: boolean;
  onToggleTree: () => void;
}

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.25;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function FileViewerContent({ tabId, filePath, treeOpen, onToggleTree }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [error, setError] = useState(false);
  // null = fit-to-frame (VSCode's default); a number is an explicit zoom
  // factor (1 = 100%) the user opted into via click/wheel/buttons.
  const [zoom, setZoom] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setError(false);
    setZoom(null);
    setNaturalSize(null);
    if (!filePath) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    readFileBinaryPreview(tabId, filePath)
      .then((preview) => {
        if (cancelled) return;
        if (!preview) {
          setError(true);
          return;
        }
        const blob = base64ToBlob(preview.content, preview.mimeType);
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setMimeType(preview.mimeType);
        setFileSize(blob.size);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [tabId, filePath]);

  // Ctrl/Cmd+wheel is how a trackpad pinch reaches the DOM (Chromium
  // synthesizes it as a wheel event with ctrlKey set, the same convention
  // browsers use for page zoom) — there is no separate pinch gesture event.
  const onWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom((prev) => clampZoom((prev ?? 1) - e.deltaY * 0.01));
  }, []);

  const zoomLabel = zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`;
  const isPdf = mimeType === "application/pdf";

  return (
    <div className="file-viewer">
      <div className="obsidian-float-actions">
        {!isPdf && blobUrl && (
          <>
            <button
              type="button"
              className="obsidian-topbar-icon"
              title="Zoom out"
              disabled={clampZoom((zoom ?? 1) - ZOOM_STEP) === (zoom ?? 1)}
              onClick={() => setZoom(clampZoom((zoom ?? 1) - ZOOM_STEP))}
            >
              −
            </button>
            <button
              type="button"
              className="file-viewer-zoom-label"
              title="Reset to fit"
              onClick={() => setZoom(null)}
            >
              {zoomLabel}
            </button>
            <button
              type="button"
              className="obsidian-topbar-icon"
              title="Zoom in"
              disabled={clampZoom((zoom ?? 1) + ZOOM_STEP) === (zoom ?? 1)}
              onClick={() => setZoom(clampZoom((zoom ?? 1) + ZOOM_STEP))}
            >
              +
            </button>
          </>
        )}
        <button
          type="button"
          className={`obsidian-topbar-icon${treeOpen ? " active" : ""}`}
          title="Toggle file explorer"
          onClick={onToggleTree}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.586a1 1 0 0 1 .707.293l1.414 1.414A1 1 0 0 0 10.414 3.5H13A1.5 1.5 0 0 1 14.5 5v8.5A1.5 1.5 0 0 1 13 15H3A1.5 1.5 0 0 1 1.5 13.5v-11Z"
            />
          </svg>
        </button>
      </div>

      {!filePath ? (
        <div className="file-viewer-empty">No file</div>
      ) : error ? (
        <div className="file-viewer-empty">Couldn't load file</div>
      ) : !blobUrl || !mimeType ? (
        <div className="file-viewer-empty">Loading…</div>
      ) : isPdf ? (
        <embed className="file-viewer-pdf" type="application/pdf" src={blobUrl} />
      ) : (
        <>
          <div className="file-viewer-image-frame" onWheel={onWheel}>
            <img
              className={`file-viewer-image${zoom === null ? " file-viewer-image-fit" : ""}`}
              src={blobUrl}
              alt={filePath.split("/").pop() ?? filePath}
              draggable={false}
              style={
                zoom !== null && naturalSize
                  ? { width: naturalSize.width * zoom, height: naturalSize.height * zoom }
                  : undefined
              }
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              onError={() => setError(true)}
              onClick={() => setZoom((prev) => (prev === null ? 1 : null))}
            />
          </div>
          <div className="file-viewer-statusbar">
            {naturalSize ? (
              <span>
                {naturalSize.width} × {naturalSize.height}
              </span>
            ) : null}
            <span>{formatBytes(fileSize)}</span>
            <span>{zoomLabel}</span>
          </div>
        </>
      )}
    </div>
  );
}
