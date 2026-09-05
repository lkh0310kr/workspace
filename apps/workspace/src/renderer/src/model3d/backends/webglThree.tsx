import { Suspense, useEffect, useMemo, useRef, type ComponentRef, type ReactNode, Component } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, Grid, Html, OrbitControls, useBounds } from "@react-three/drei";
import * as THREE from "three";
import type { RenderPipelineHooks } from "../../../../shared/model3d/viewer";
import { createOrbitCameraHandle, createOrbitCameraState } from "./camera/orbitCamera";
import type { OrbitCameraHandle } from "./camera/orbitCamera";
import type { DetectedModelFormat } from "../../../../shared/model3d/types";
import { useGltfFromBuffer, useGltfFromUrl } from "./useGltfFromUrl";
import { useMeshFromBuffer } from "./useMeshFromBuffer";
import { logModel3d } from "../model3dLog";

const GLTF_FORMATS = new Set<DetectedModelFormat>(["glb", "gltf"]);
const MESH_FORMATS = new Set<DetectedModelFormat>(["obj", "stl", "ply", "dae", "fbx"]);

interface ModelProps {
  modelData?: ArrayBuffer;
  modelUrl?: string;
  format: DetectedModelFormat;
  wireframe: boolean;
  onLoaded?: () => void;
}

function applyWireframe(scene: THREE.Object3D, wireframe: boolean): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const mat = material as THREE.MeshStandardMaterial;
      mat.wireframe = wireframe;
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

function GltfLoadedModel({
  modelData,
  wireframe,
  onLoaded,
}: {
  modelData: ArrayBuffer;
  wireframe: boolean;
  onLoaded?: () => void;
}) {
  const { gltf, error, loading } = useGltfFromBuffer(modelData);
  const bounds = useBounds();

  const scene = useMemo(() => {
    if (!gltf) return null;
    return gltf.scene.clone(true);
  }, [gltf]);

  useEffect(() => {
    if (!scene) return;
    applyWireframe(scene, wireframe);
  }, [scene, wireframe]);

  useEffect(() => {
    if (!scene) return;
    bounds.refresh().fit();
    onLoaded?.();
    void logModel3d("gltf_scene_mounted", { byteLength: modelData.byteLength });
  }, [scene, bounds, onLoaded, modelData]);

  if (loading) {
    return (
      <Html center>
        <div className="model-viewer-canvas-hint">Parsing model…</div>
      </Html>
    );
  }

  if (error) {
    throw error;
  }

  if (!scene) return null;

  return <primitive object={scene} />;
}

function GltfUrlLoadedModel({
  modelUrl,
  wireframe,
  onLoaded,
}: {
  modelUrl: string;
  wireframe: boolean;
  onLoaded?: () => void;
}) {
  const { gl } = useThree();
  const { gltf, error, loading } = useGltfFromUrl(modelUrl, gl);
  const bounds = useBounds();

  const scene = useMemo(() => {
    if (!gltf) return null;
    return gltf.scene.clone(true);
  }, [gltf]);

  useEffect(() => {
    if (!scene) return;
    applyWireframe(scene, wireframe);
  }, [scene, wireframe]);

  useEffect(() => {
    if (!scene) return;
    bounds.refresh().fit();
    onLoaded?.();
    void logModel3d("gltf_scene_mounted", { modelUrl });
  }, [scene, bounds, onLoaded, modelUrl]);

  if (loading) {
    return (
      <Html center>
        <div className="model-viewer-canvas-hint">Loading model…</div>
      </Html>
    );
  }

  if (error) {
    throw error;
  }

  if (!scene) return null;

  return <primitive object={scene} />;
}

function MeshLoadedModel({ modelData, modelUrl, format, wireframe, onLoaded }: ModelProps) {
  const { scene: parsed, error, loading } = useMeshFromBuffer(modelData, modelUrl, format);
  const bounds = useBounds();

  const scene = useMemo(() => {
    if (!parsed) return null;
    return parsed.clone(true);
  }, [parsed]);

  useEffect(() => {
    if (!scene) return;
    applyWireframe(scene, wireframe);
  }, [scene, wireframe]);

  useEffect(() => {
    if (!scene) return;
    bounds.refresh().fit();
    onLoaded?.();
    void logModel3d("mesh_scene_mounted", {
      byteLength: modelData?.byteLength ?? null,
      modelUrl: modelUrl ?? null,
      format,
    });
  }, [scene, bounds, onLoaded, modelData, modelUrl, format]);

  if (loading) {
    return (
      <Html center>
        <div className="model-viewer-canvas-hint">Parsing model…</div>
      </Html>
    );
  }

  if (error) {
    throw error;
  }

  if (!scene) return null;

  return <primitive object={scene} />;
}

function LoadedModel(props: ModelProps) {
  if (GLTF_FORMATS.has(props.format)) {
    if (props.modelUrl) {
      return <GltfUrlLoadedModel modelUrl={props.modelUrl} wireframe={props.wireframe} onLoaded={props.onLoaded} />;
    }
    if (props.modelData) {
      return (
        <GltfLoadedModel modelData={props.modelData} wireframe={props.wireframe} onLoaded={props.onLoaded} />
      );
    }
    throw new Error("GLTF model requires modelData or modelUrl");
  }
  if (MESH_FORMATS.has(props.format)) {
    return <MeshLoadedModel {...props} />;
  }
  throw new Error(`Unsupported model format: ${props.format}`);
}

function PipelineTicker({ pipeline }: { pipeline?: RenderPipelineHooks }) {
  const frame = useRef(0);
  useFrame((_state, delta) => {
    const ctx = { frame: frame.current++, deltaMs: delta * 1000 };
    pipeline?.onBeforeRender?.(ctx);
    pipeline?.onAfterRender?.(ctx);
  });
  return null;
}

function CameraBridge({ onReady }: { onReady: (handle: OrbitCameraHandle) => void }) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const bounds = useBounds();
  const { camera } = useThree();

  useEffect(() => {
    const handle = createOrbitCameraHandle(
      () => {
        bounds.refresh().fit();
        controlsRef.current?.reset();
        camera.position.set(2.5, 2, 2.5);
        controlsRef.current?.update();
      },
      () => ({
        ...createOrbitCameraState(),
        distance: camera.position.length(),
        target: controlsRef.current?.target
          ? [controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z]
          : [0, 0, 0],
      }),
    );
    onReady(handle);
  }, [bounds, camera, onReady]);

  return <OrbitControls ref={controlsRef} makeDefault enableDamping />;
}

class ModelLoadErrorBoundary extends Component<
  { onError?: (error: Error) => void; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <Html center>
          <div className="model-viewer-canvas-hint">{this.state.error.message}</div>
        </Html>
      );
    }
    return this.props.children;
  }
}

export interface WebGlThreeViewerProps {
  modelData?: ArrayBuffer;
  modelUrl?: string;
  format: DetectedModelFormat;
  wireframe: boolean;
  showGrid: boolean;
  pipeline?: RenderPipelineHooks;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onCameraReady?: (handle: OrbitCameraHandle) => void;
}

export function WebGlThreeViewer({
  modelData,
  modelUrl,
  format,
  wireframe,
  showGrid,
  pipeline,
  onReady,
  onError,
  onCameraReady,
}: WebGlThreeViewerProps) {
  return (
    <ModelLoadErrorBoundary onError={onError}>
      <Canvas
        className="model-viewer-canvas"
        style={{ width: "100%", height: "100%" }}
        frameloop="always"
        dpr={[1, 1.5]}
        camera={{ position: [2.5, 2, 2.5], fov: 45, near: 0.01, far: 1000 }}
        onCreated={() => onReady?.()}
        gl={{
          antialias: true,
          alpha: false,
          failIfMajorPerformanceCaveat: false,
          powerPreference: "default",
        }}
      >
        <color attach="background" args={["#1a1a1a"]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 8, 6]} intensity={1.25} />
        <directionalLight position={[-4, 2, -3]} intensity={0.35} />
        <Bounds fit clip observe margin={1.3}>
          <Suspense fallback={null}>
            <LoadedModel
              modelData={modelData}
              modelUrl={modelUrl}
              format={format}
              wireframe={wireframe}
            />
          </Suspense>
          <CameraBridge onReady={(handle) => onCameraReady?.(handle)} />
        </Bounds>
        {showGrid ? <Grid infiniteGrid fadeDistance={30} cellSize={0.5} sectionSize={2} position={[0, -0.001, 0]} /> : null}
        <PipelineTicker pipeline={pipeline} />
      </Canvas>
    </ModelLoadErrorBoundary>
  );
}
