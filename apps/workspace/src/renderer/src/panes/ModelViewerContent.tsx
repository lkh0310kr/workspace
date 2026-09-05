import type { ReactNode } from "react";
import { ModelViewerCanvas } from "../model3d/components/ModelViewerCanvas";
import { ModelViewerLoading } from "../model3d/components/ModelViewerLoading";
import { ModelViewerUnsupported } from "../model3d/components/ModelViewerUnsupported";
import { useModelPreview } from "../model3d/import/useModelPreview";

interface Props {
  tabId: number;
  filePath: string | null;
  paneActive: boolean;
  treeOpen: boolean;
  onToggleTree: () => void;
}

export function ModelViewerContent({ tabId, filePath, paneActive, treeOpen, onToggleTree }: Props) {
  const preview = useModelPreview(tabId, filePath);

  let body: ReactNode;
  if (preview.phase === "opening") {
    body = <ModelViewerLoading label="Opening model…" />;
  } else if (preview.phase === "loading") {
    body = <ModelViewerLoading label="Loading model…" />;
  } else if (preview.phase === "unsupported") {
    body = (
      <ModelViewerUnsupported
        variant="unsupported"
        message={preview.error ?? "이 포맷은 아직 지원되지 않습니다."}
      />
    );
  } else if (preview.phase === "error") {
    body = (
      <ModelViewerUnsupported variant="error" message={preview.error ?? "모델을 불러오지 못했습니다."} />
    );
  } else if (preview.phase === "ready" && (preview.modelData || preview.modelUrl)) {
    body = (
      <ModelViewerCanvas
        key={preview.revision}
        modelData={preview.modelData ?? undefined}
        modelUrl={preview.modelUrl ?? undefined}
        format={preview.manifest?.renderFormat ?? preview.manifest?.source.format ?? "glb"}
        active={paneActive}
        live
        refreshing={preview.refreshing}
        refreshError={preview.error}
      />
    );
  } else {
    body = <ModelViewerLoading label="Preparing viewer…" />;
  }

  return (
    <div className="model-viewer file-viewer">
      <div className="obsidian-float-actions">
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
      <div className="model-viewer-body">{body}</div>
    </div>
  );
}
