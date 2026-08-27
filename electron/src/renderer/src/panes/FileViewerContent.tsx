import { useEffect, useState } from "react";
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
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function FileViewerContent({ tabId, filePath }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
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
        createdUrl = base64ToBlobUrl(preview.content, preview.mimeType);
        setBlobUrl(createdUrl);
        setMimeType(preview.mimeType);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [tabId, filePath]);

  if (!filePath) {
    return <div className="file-viewer-empty">No file</div>;
  }
  if (error) {
    return <div className="file-viewer-empty">Couldn't load file</div>;
  }
  if (!blobUrl || !mimeType) {
    return <div className="file-viewer-empty">Loading…</div>;
  }

  const name = filePath.split("/").pop() ?? filePath;

  return (
    <div className="file-viewer">
      {mimeType === "application/pdf" ? (
        <embed className="file-viewer-pdf" type="application/pdf" src={blobUrl} />
      ) : (
        <div className="file-viewer-image-frame">
          <img
            className="file-viewer-image"
            src={blobUrl}
            alt={name}
            draggable={false}
            onError={() => setError(true)}
          />
        </div>
      )}
    </div>
  );
}
