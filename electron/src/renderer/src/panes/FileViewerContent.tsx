import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type WheelEvent,
} from "react";
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

// Zoom behavior ported from VSCode's own image preview
// (extensions/media-preview/media/imagePreview.js) rather than invented:
// discrete zoom levels (not a fixed step), a multiplicative pinch factor
// keyed off wheel direction only (not raw deltaY — trackpads report wildly
// different magnitudes), and pixelation past 3x. Not ported: VSCode's
// scroll-position-centered re-zoom and copy-as-PNG — real complexity this
// pane's scope doesn't need yet.
const ZOOM_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 5, 7, 10, 15, 20];
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 20;
const PINCH_FACTOR = 0.075;
const PIXELATION_THRESHOLD = 3;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function nextZoomIn(current: number): number {
  const next = ZOOM_LEVELS.find((level) => level > current);
  return next ?? ZOOM_MAX;
}

function nextZoomOut(current: number): number {
  const next = [...ZOOM_LEVELS].reverse().find((level) => level < current);
  return next ?? ZOOM_MIN;
}

// Byte formatting matches VSCode's binarySizeStatusBarEntry.ts exactly
// (no space before the unit, always 2 decimals for KB and up).
function formatBytes(size: number): string {
  const KB = 1024;
  const MB = KB * KB;
  const GB = MB * KB;
  const TB = GB * KB;
  if (size < KB) return `${size}B`;
  if (size < MB) return `${(size / KB).toFixed(2)}KB`;
  if (size < GB) return `${(size / MB).toFixed(2)}MB`;
  if (size < TB) return `${(size / GB).toFixed(2)}GB`;
  return `${(size / TB).toFixed(2)}TB`;
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
  const imgRef = useRef<HTMLImageElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [error, setError] = useState(false);
  // null = "fit" (VSCode's default scale-to-fit); a number is an explicit
  // zoom factor (1 = 100%) the user opted into via click/wheel/buttons.
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

  // The scale-to-fit ratio actually on screen right now, used as the
  // starting point the first time the user zooms in/out from "fit" —
  // matches VSCode's firstZoom(): image.clientWidth / naturalWidth, or 1
  // for an SVG with only a viewBox (no intrinsic natural size).
  const currentEffectiveZoom = useCallback((): number => {
    if (zoom !== null) return zoom;
    const img = imgRef.current;
    if (img && naturalSize && naturalSize.width > 0) {
      return img.clientWidth / naturalSize.width;
    }
    return 1;
  }, [zoom, naturalSize]);

  const onImageClick = useCallback(
    (e: MouseEvent) => {
      const base = currentEffectiveZoom();
      const zoomOut = e.altKey || e.ctrlKey || e.metaKey;
      setZoom(clampZoom(zoomOut ? nextZoomOut(base) : nextZoomIn(base)));
    },
    [currentEffectiveZoom],
  );

  // Ctrl/Cmd+wheel is how a trackpad pinch reaches the DOM (Chromium
  // synthesizes it as a wheel event with ctrlKey set — there is no separate
  // pinch gesture event). Direction only, not raw deltaY magnitude: VSCode
  // does the same since trackpads report wildly different deltaY scales
  // across OSes/devices.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const base = currentEffectiveZoom();
      const direction = e.deltaY > 0 ? 1 : -1;
      setZoom(clampZoom(base * (1 - direction * PINCH_FACTOR)));
    },
    [currentEffectiveZoom],
  );

  const zoomLabel = zoom === null ? "Whole Image" : `${Math.round(zoom * 100)}%`;
  const isPdf = mimeType === "application/pdf";

  return (
    <div className="file-viewer">
      <div className="obsidian-float-actions">
        {!isPdf && blobUrl && (
          <>
            <button
              type="button"
              className="obsidian-topbar-icon"
              title="Zoom out (or Alt/Ctrl+click the image)"
              onClick={() => setZoom(clampZoom(nextZoomOut(currentEffectiveZoom())))}
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
              title="Zoom in (or click the image)"
              onClick={() => setZoom(clampZoom(nextZoomIn(currentEffectiveZoom())))}
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
              ref={imgRef}
              className={`file-viewer-image${zoom === null ? " file-viewer-image-fit" : ""}${
                zoom !== null && zoom >= PIXELATION_THRESHOLD ? " file-viewer-image-pixelated" : ""
              }`}
              src={blobUrl}
              alt={filePath.split("/").pop() ?? filePath}
              draggable={false}
              style={zoom !== null ? ({ zoom } as CSSProperties) : undefined}
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              onError={() => setError(true)}
              onClick={onImageClick}
            />
          </div>
          <div className="file-viewer-statusbar">
            {naturalSize ? (
              <span>
                {naturalSize.width}x{naturalSize.height}
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
