import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DetectedModelFormat } from "../../../../shared/model3d/types";
import type { ViewerSession } from "../../../../shared/model3d/viewer";
import type { OrbitCameraHandle } from "../backends/camera/orbitCamera";
import { WebGlThreeViewer } from "../backends/webglThree";
import { probeWebGL } from "../backends/webglProbe";
import { defaultRenderPipeline } from "../backends/pipeline/defaultPipeline";
import { logModel3d } from "../model3dLog";
import { ModelViewerToolbar } from "./ModelViewerToolbar";
import { ModelViewerUnsupported } from "./ModelViewerUnsupported";

function isElectronModelHost(): boolean {
  return typeof window.api?.model3d?.openPreview === "function";
}

/** Defer WebGL canvas mount so React Strict Mode does not exhaust contexts. */
function useDeferredCanvasMount(enabled: boolean, sessionKey: string): boolean {
  const [show, setShow] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setShow(false);
      return;
    }
    const generation = ++generationRef.current;
    const start = window.setTimeout(() => {
      if (generationRef.current === generation) setShow(true);
    }, 32);
    return () => {
      clearTimeout(start);
      window.setTimeout(() => {
        if (generationRef.current === generation) setShow(false);
      }, 120);
    };
  }, [enabled, sessionKey]);

  return show;
}

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
  const inElectron = useMemo(() => isElectronModelHost(), []);
  const webglProbe = useMemo(() => probeWebGL(), []);
  const sessionKey = `${modelUrl ?? "buf"}:${modelData?.byteLength ?? 0}:${format}`;
  const showCanvas = useDeferredCanvasMount(
    active && hostSized && inElectron && webglProbe.ok,
    sessionKey,
  );

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
      inElectron,
      webglOk: webglProbe.ok,
      showCanvas,
    });
    return () => {
      void logModel3d("viewer_dispose", {
        byteLength: modelData?.byteLength ?? null,
        modelUrl: modelUrl ?? null,
      });
    };
  }, [modelData, modelUrl, active, live, refreshing, inElectron, webglProbe.ok, showCanvas]);

  let body: ReactNode;
  if (!inElectron) {
    body = (
      <ModelViewerUnsupported
        variant="error"
        message="3D model preview requires the Workspace Electron app. Do not open localhost:5173 in an external browser."
      />
    );
  } else if (!active) {
    body = <div className="model-viewer-canvas-hint">Select this pane to view the model.</div>;
  } else if (!webglProbe.ok) {
    body = <ModelViewerUnsupported variant="error" message={webglProbe.reason} />;
  } else if (!hostSized) {
    body = <div className="model-viewer-canvas-hint">Preparing canvas…</div>;
  } else if (!showCanvas) {
    body = <div className="model-viewer-canvas-hint">Starting WebGL…</div>;
  } else {
    body = (
      <WebGlThreeViewer
        key={sessionKey}
        modelData={modelData}
        modelUrl={modelUrl}
        format={format}
        wireframe={wireframe}
        showGrid={showGrid}
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
    );
  }

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
        <div className="model-viewer-gl-surface">{body}</div>
        {refreshError ? (
          <div className="model-viewer-refresh-error" role="status">
            {refreshError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
