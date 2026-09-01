import { useEffect, useMemo, useRef, useState } from "react";
import type { DetectedModelFormat } from "../../../../shared/model3d/types";
import type { ViewerSession } from "../../../../shared/model3d/viewer";
import type { OrbitCameraHandle } from "../backends/camera/orbitCamera";
import { WebGlThreeViewer } from "../backends/webglThree";
import { defaultRenderPipeline } from "../backends/pipeline/defaultPipeline";
import { logModel3d } from "../model3dLog";
import { ModelViewerToolbar } from "./ModelViewerToolbar";

interface Props {
  modelData: ArrayBuffer;
  format: DetectedModelFormat;
  active: boolean;
  onReady?: () => void;
}

export function ModelViewerCanvas({ modelData, format, active, onReady }: Props) {
  const cameraRef = useRef<OrbitCameraHandle | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  const session = useMemo<ViewerSession>(
    () => ({
      setWireframe: setWireframe,
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
    void logModel3d("viewer_mount", { byteLength: modelData.byteLength, active });
    return () => {
      void logModel3d("viewer_dispose", { byteLength: modelData.byteLength });
    };
  }, [modelData, active]);

  return (
    <div className="model-viewer-canvas-wrap">
      <ModelViewerToolbar
        session={session}
        wireframe={wireframe}
        showGrid={showGrid}
        onWireframeChange={setWireframe}
        onGridChange={setShowGrid}
      />
      <div className="model-viewer-host">
        <WebGlThreeViewer
          modelData={modelData}
          format={format}
          wireframe={wireframe}
          showGrid={showGrid}
          active={active}
          pipeline={defaultRenderPipeline}
          onReady={() => {
            void logModel3d("viewer_canvas_ready", { byteLength: modelData.byteLength });
            onReady?.();
          }}
          onError={(error) => {
            void logModel3d("viewer_error", { error: error.message, stack: error.stack });
          }}
          onCameraReady={(handle) => {
            cameraRef.current = handle;
          }}
        />
      </div>
    </div>
  );
}
