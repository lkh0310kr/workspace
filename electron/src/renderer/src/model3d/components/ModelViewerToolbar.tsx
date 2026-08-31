import type { ViewerSession } from "../../../../shared/model3d/viewer";

interface Props {
  session: ViewerSession | null;
  wireframe: boolean;
  showGrid: boolean;
  onWireframeChange: (value: boolean) => void;
  onGridChange: (value: boolean) => void;
}

export function ModelViewerToolbar({
  session,
  wireframe,
  showGrid,
  onWireframeChange,
  onGridChange,
}: Props) {
  return (
    <div className="model-viewer-toolbar">
      <button
        type="button"
        className="model-viewer-toolbar-btn"
        onClick={() => session?.getCameraController().reset()}
        title="Reset camera"
      >
        Reset
      </button>
      <button
        type="button"
        className={`model-viewer-toolbar-btn${wireframe ? " active" : ""}`}
        onClick={() => {
          const next = !wireframe;
          onWireframeChange(next);
          session?.setWireframe(next);
        }}
        title="Toggle wireframe"
      >
        Wireframe
      </button>
      <button
        type="button"
        className={`model-viewer-toolbar-btn${showGrid ? " active" : ""}`}
        onClick={() => {
          const next = !showGrid;
          onGridChange(next);
          session?.setGridVisible(next);
        }}
        title="Toggle grid"
      >
        Grid
      </button>
    </div>
  );
}
