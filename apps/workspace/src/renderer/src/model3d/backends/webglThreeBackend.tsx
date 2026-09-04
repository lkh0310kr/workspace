import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ViewerBackend, ViewerMountOptions, ViewerSession } from "../../../../shared/model3d/viewer";
import type { OrbitCameraHandle } from "./camera/orbitCamera";
import { WebGlThreeViewer } from "./webglThree";

interface SessionBridge {
  setWireframe(enabled: boolean): void;
  setGridVisible(visible: boolean): void;
  getCamera(): OrbitCameraHandle | null;
}

function StatefulViewer({
  initial,
  onSession,
}: {
  initial: ViewerMountOptions;
  onSession: (api: SessionBridge) => void;
}) {
  const [wireframe, setWireframe] = useState(initial.wireframe ?? false);
  const [showGrid, setShowGrid] = useState(initial.showGrid ?? true);
  const cameraRef = useRef<OrbitCameraHandle | null>(null);

  useEffect(() => {
    onSession({
      setWireframe,
      setGridVisible: setShowGrid,
      getCamera: () => cameraRef.current,
    });
  }, [onSession]);

  return (
    <WebGlThreeViewer
      modelData={initial.modelData}
      modelUrl={initial.modelUrl}
      format={initial.manifest.status === "ready" ? initial.manifest.source.format : "glb"}
      wireframe={wireframe}
      showGrid={showGrid}
      active={initial.active ?? true}
      pipeline={initial.pipeline}
      onReady={initial.onReady}
      onError={initial.onError}
      onCameraReady={(handle) => {
        cameraRef.current = handle;
      }}
    />
  );
}

class WebGlThreeSession implements ViewerSession {
  private bridge: SessionBridge | null = null;

  constructor(private readonly root: Root) {}

  attachBridge(bridge: SessionBridge) {
    this.bridge = bridge;
  }

  setWireframe(enabled: boolean): void {
    this.bridge?.setWireframe(enabled);
  }

  setGridVisible(visible: boolean): void {
    this.bridge?.setGridVisible(visible);
  }

  getCameraController() {
    const camera = this.bridge?.getCamera();
    if (!camera) {
      return {
        reset: () => {},
        setMode: () => {},
        getState: () => ({
          mode: "orbit" as const,
          target: [0, 0, 0] as [number, number, number],
          distance: 4,
        }),
      };
    }
    return camera;
  }

  async screenshot(): Promise<Blob> {
    throw new Error("screenshot not implemented");
  }

  dispose(): void {
    this.root.unmount();
  }
}

export const webGlThreeBackend: ViewerBackend = {
  id: "webgl-three",
  supports(features: string[]) {
    return features.every((feature) => ["orbit", "pbr", "wireframe", "grid"].includes(feature));
  },
  mount(container: HTMLElement, options: ViewerMountOptions): ViewerSession {
    const root = createRoot(container);
    const session = new WebGlThreeSession(root);
    root.render(
      <StatefulViewer initial={options} onSession={(bridge) => session.attachBridge(bridge)} />,
    );
    return session;
  },
};
