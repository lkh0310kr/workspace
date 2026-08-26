import { useEffect, useState } from "react";
import { resolveFileUrl } from "../electron";

// v1 of the ideation.md "File Viewer" pane — images and PDFs only, per the
// scoped-down plan. Video/audio/e-book are separate future slices.
interface Props {
  tabId: number;
  filePath: string | null;
}

const PDF_EXTENSIONS = [".pdf"];

function isPdf(path: string): boolean {
  const lower = path.toLowerCase();
  return PDF_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function FileViewerContent({ tabId, filePath }: Props) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setFileUrl(null);
    setError(false);
    if (!filePath) return;
    let cancelled = false;
    // Why: resolves through the main process's resolveUnderRoot confinement
    // (same guarantee readFile uses) instead of building a file:// URL from
    // rootPath + filePath directly in the renderer — a corrupted or crafted
    // persisted layout.json must not be able to point this at an arbitrary
    // path outside the workspace root via `../` segments.
    resolveFileUrl(tabId, filePath)
      .then((url) => {
        if (!cancelled) setFileUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tabId, filePath]);

  if (!filePath) {
    return <div className="file-viewer-empty">No file</div>;
  }
  if (error) {
    return <div className="file-viewer-empty">Couldn't load file</div>;
  }
  if (!fileUrl) {
    return <div className="file-viewer-empty">Loading…</div>;
  }

  const name = filePath.split("/").pop() ?? filePath;

  return (
    <div className="file-viewer">
      {isPdf(filePath) ? (
        <embed className="file-viewer-pdf" type="application/pdf" src={fileUrl} />
      ) : (
        <div className="file-viewer-image-frame">
          <img
            className="file-viewer-image"
            src={fileUrl}
            alt={name}
            draggable={false}
            onError={() => setError(true)}
          />
        </div>
      )}
    </div>
  );
}
