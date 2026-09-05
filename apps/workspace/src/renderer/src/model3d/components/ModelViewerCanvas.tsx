import { useEffect, useMemo, useRef, useState } from "react";
import type { DetectedModelFormat } from "../../../../shared/model3d/types";
import type { ViewerSession } from "../../../../shared/model3d/viewer";
import type { OrbitCameraHandle } from "../backends/camera/orbitCamera";
import { WebGlThreeViewer } from "../backends/webglThree";
import { probeWebGL } from "../backends/webglProbe";
import { defaultRenderPipeline } from "../backends/pipeline/defaultPipeline";
import { logModel3d } from "../model3dLog";
import { ModelViewerToolbar } from "./ModelViewerToolbar";
import { ModelViewerUnsupported } from "./ModelViewerUnsupported";

interface Props {
  modelData?: ArrayBuffer;
  modelUrl?: string;
  format: DetectedModelFormat;
  active: boolean;
  live?: boolean;
  refreshing?: boolean;
  refreshError?: string | null;
  onReady?: () => void;
}

export function ModelViewerCanvas({
  modelData,
  modelUrl,
  format,
  active,
  live = false,
  refreshing = false,
  refreshError = null,
  onReady,
}: Props) {
  const cameraRef = useRef<OrbitCameraHandle | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [hostSized, setHostSized] = useState(false);
  const webglProbe = useMemo(() => probeWebGL(), []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setHostSized(rect.width > 8 && rect.height > 8);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const session = useMemo<ViewerSession>(
    () => ({
      setWireframe,
      setGridVisible: setShowGrid,
      getCameraController: () =>
        cameraRef.current ?? {
          reset: () => {},
          setMode: () => {},
          getState: () => ({
            mode: "orbit",
            target: [0, 0, 0],
            distance: 4,
          }),
        },
      screenshot: async () => {
        throw new Error("screenshot not implemented");
      },
      dispose: () => {},
    }),
    [],
  );

  useEffect(() => {
    void logModel3d("viewer_mount", {
      byteLength: modelData?.byteLength ?? null,
      modelUrl: modelUrl ?? null,
      active,
      live,
      refreshing,
    });
    return () => {
      void logModel3d("viewer_dispose", {
        byteLength: modelData?.byteLength ?? null,
        modelUrl: modelUrl ?? null,
      });
    };
  }, [modelData, modelUrl, active, live, refreshing]);

  return (
    <div className="model-viewer-canvas-wrap">
      <ModelViewerToolbar
        session={session}
        wireframe={wireframe}
        showGrid={showGrid}
        live={live}
        refreshing={refreshing}
        onWireframeChange={setWireframe}
        onGridChange={setShowGrid}
      />
      <div ref={hostRef} className="model-viewer-host">
        {!active ? (
          <div className="model-viewer-canvas-hint">Select this pane to view the model.</div>
        ) : !webglProbe.ok ? (
          <ModelViewerUnsupported variant="error" message={webglProbe.reason} />
        ) : !hostSized ? (
          <div className="model-viewer-canvas-hint">Preparing canvas…</div>
        ) : (
          <WebGlThreeViewer
            modelData={modelData}
            modelUrl={modelUrl}
            format={format}
            wireframe={wireframe}
            showGrid={showGrid}
            active={active}
            pipeline={defaultRenderPipeline}
            onReady={() => {
              void logModel3d("viewer_canvas_ready", {
                byteLength: modelData?.byteLength ?? null,
                modelUrl: modelUrl ?? null,
              });
              onReady?.();
            }}
            onError={(error) => {
              void logModel3d("viewer_error", { error: error.message, stack: error.stack });
            }}
            onCameraReady={(handle) => {
              cameraRef.current = handle;
            }}
          />
        )}
        {refreshError ? (
          <div className="model-viewer-refresh-error" role="status">
            {refreshError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
