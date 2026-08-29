import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type WheelEvent,
} from "react";
import { getMediaUrl, getMediaUrlAbsolute, pickMediaFileDialog, readFileBinaryPreview } from "../electron";
import { classifyMediaExtension } from "./mediaKind";
import { cuesToVtt, parseSrt, shiftCues, type SubtitleCue } from "./srtToVtt";
import { EpubReaderContent } from "./EpubReaderContent";

// File Viewer pane — images, PDF, video, audio, EPUB (minimal v1: unzip,
// walk the OPF spine in order, one chapter per sandboxed iframe with
// prev/next — see EpubReaderContent.tsx for the rest).
//
// Why images/PDF use blob: URLs but video/audio don't (Orca parity for
// the former — editor/useLocalImageSrc.ts): a raw file:// <img>/<embed>
// src throws "Not allowed to load local resource" — Chromium blocks
// file:// resource loads from a page not itself loaded via file://.
// Reading the bytes over IPC as base64 and handing the renderer a blob:
// URL sidesteps that and is fine for small whole-file content. It's NOT
// fine for video: loading a multi-GB file into memory as base64 is a
// 4-5x memory blowup through the IPC-copy/atob chain, blocks the main
// process synchronously, and can't seek without loading the whole file
// first — video/audio instead get a URL from the streaming
// workspace-media:// protocol (mediaProtocol.ts), which the <video>/
// <audio> element fetches (and Range-requests, for seeking) itself.
interface Props {
  tabId: number;
  filePath: string | null;
  /** Set instead of filePath when the file was picked via the native
   * Browse dialog rather than opened from within the workspace root — see
   * PaneTabItem.absolutePath's doc comment. */
  absolutePath: string | null;
  /** Set only on a blank tab created via the Video/Audio/Ebook picker
   * entries, before a file has been picked. Decides the Browse button's
   * label/dialog filters and the empty state; ignored once filePath or
   * absolutePath is set. */
  viewerHint?: "video" | "audio" | "ebook";
  onAssignAbsolutePath: (path: string) => void;
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

export function FileViewerContent({
  tabId,
  filePath,
  absolutePath,
  viewerHint,
  onAssignAbsolutePath,
  treeOpen,
  onToggleTree,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [error, setError] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  // null = "fit" (VSCode's default scale-to-fit); a number is an explicit
  // zoom factor (1 = 100%) the user opted into via click/wheel/buttons.
  const [zoom, setZoom] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[] | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleVttUrl, setSubtitleVttUrl] = useState<string | null>(null);

  // Images/PDF never come from the Browse-anywhere flow (no picker entry
  // for them) — only video/audio/ebook do, so absolutePath only ever
  // matters alongside those three kinds.
  const activePath = filePath ?? absolutePath;
  const kind = activePath ? classifyMediaExtension(activePath) : "other";
  const isVideo = kind === "video";
  const isAudio = kind === "audio";
  const isPdf = kind === "pdf";
  const isEpub = kind === "epub";
  const isMedia = isVideo || isAudio;

  const onBrowse = useCallback(() => {
    if (!viewerHint) return;
    setBrowsing(true);
    pickMediaFileDialog(viewerHint)
      .then((path) => {
        if (path) onAssignAbsolutePath(path);
      })
      .catch((err) => console.error("[FileViewer] pick media failed:", err))
      .finally(() => setBrowsing(false));
  }, [viewerHint, onAssignAbsolutePath]);

  useEffect(() => {
    setError(false);
    setZoom(null);
    setNaturalSize(null);
    setMediaUrl(null);
    setSubtitleCues(null);
    setSubtitleOffset(0);
    setSubtitleVttUrl(null);
    if (!filePath && !absolutePath) return;
    // EPUB owns its own load path entirely (EpubReaderContent's openEpub
    // call) — neither the base64-preview path nor the media protocol
    // applies to a zip archive.
    if (isEpub) return;

    if (isMedia) {
      let cancelled = false;
      const request = absolutePath ? getMediaUrlAbsolute(absolutePath) : getMediaUrl(tabId, filePath!);
      request
        .then((url) => {
          if (cancelled) return;
          if (!url) {
            setError(true);
            return;
          }
          setMediaUrl(url);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
      return () => {
        cancelled = true;
      };
    }

    // Only reachable for filePath (workspace-relative) — image/PDF never
    // arrive via absolutePath (see the comment above activePath).
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
        setFileSize(blob.size);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, filePath, absolutePath, isMedia, isEpub]);

  // Revoke the subtitle blob URL whenever it's replaced or the pane
  // unmounts — same cleanup shape as the image blob above.
  useEffect(() => {
    return () => {
      if (subtitleVttUrl) URL.revokeObjectURL(subtitleVttUrl);
    };
  }, [subtitleVttUrl]);

  const onSubtitleFilePicked = useCallback((file: File) => {
    file
      .text()
      .then((text) => {
        const cues = parseSrt(text);
        setSubtitleCues(cues);
        setSubtitleOffset(0);
        setSubtitleVttUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(new Blob([cuesToVtt(cues)], { type: "text/vtt" }));
        });
      })
      .catch(() => setError(true));
  }, []);

  const onSubtitleOffsetChange = useCallback(
    (offsetSeconds: number) => {
      setSubtitleOffset(offsetSeconds);
      if (!subtitleCues) return;
      setSubtitleVttUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(
          new Blob([cuesToVtt(shiftCues(subtitleCues, offsetSeconds))], { type: "text/vtt" }),
        );
      });
    },
    [subtitleCues],
  );

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

  return (
    <div className="file-viewer">
      <div className="obsidian-float-actions">
        {!isPdf && !isMedia && blobUrl && (
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
        {isVideo && mediaUrl && (
          <>
            <label className="file-viewer-subtitle-pick" title="Add subtitle file (.srt)">
              CC+
              <input
                type="file"
                accept=".srt,.vtt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onSubtitleFilePicked(file);
                  e.target.value = "";
                }}
              />
            </label>
            {subtitleCues && (
              <input
                type="number"
                step="0.1"
                className="file-viewer-subtitle-offset"
                title="Subtitle timing offset (seconds)"
                value={subtitleOffset}
                onChange={(e) => onSubtitleOffsetChange(Number(e.target.value) || 0)}
              />
            )}
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

      {!activePath ? (
        viewerHint ? (
          <div className="file-viewer-empty file-viewer-browse-prompt">
            <button type="button" className="file-viewer-browse-button" onClick={onBrowse} disabled={browsing}>
              {browsing ? "Choosing…" : `Browse for ${viewerHint}…`}
            </button>
          </div>
        ) : (
          <div className="file-viewer-empty">No file</div>
        )
      ) : error ? (
        <div className="file-viewer-empty">Couldn't load file</div>
      ) : isEpub ? (
        absolutePath ? (
          <EpubReaderContent absolutePath={absolutePath} />
        ) : (
          <EpubReaderContent tabId={tabId} filePath={filePath!} />
        )
      ) : isVideo ? (
        !mediaUrl ? (
          <div className="file-viewer-empty">Loading…</div>
        ) : (
          <video className="file-viewer-video" src={mediaUrl} controls onError={() => setError(true)}>
            {subtitleVttUrl && <track kind="subtitles" src={subtitleVttUrl} default />}
          </video>
        )
      ) : isAudio ? (
        !mediaUrl ? (
          <div className="file-viewer-empty">Loading…</div>
        ) : (
          <div className="file-viewer-audio">
            <audio src={mediaUrl} controls onError={() => setError(true)} />
          </div>
        )
      ) : !blobUrl ? (
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
              alt={activePath.split("/").pop() ?? activePath}
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
