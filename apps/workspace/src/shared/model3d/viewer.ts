import type { SceneManifest } from "./types";

export type CameraMode = "orbit" | "fps" | "ortho";

export interface CameraState {
  mode: CameraMode;
  target: [number, number, number];
  distance: number;
}

export interface CameraController {
  reset(): void;
  setMode(mode: CameraMode): void;
  getState(): CameraState;
}

export interface RenderFrameContext {
  frame: number;
  deltaMs: number;
}

/** Hooks for future custom shaders and post-processing. */
export interface RenderPipelineHooks {
  onBeforeRender?: (ctx: RenderFrameContext) => void;
  onAfterRender?: (ctx: RenderFrameContext) => void;
}

export interface ViewerMountOptions {
  manifest: SceneManifest;
  modelData?: ArrayBuffer;
  modelUrl?: string;
  wireframe?: boolean;
  showGrid?: boolean;
  active?: boolean;
  pipeline?: RenderPipelineHooks;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export interface ViewerSession {
  setWireframe(enabled: boolean): void;
  setGridVisible(visible: boolean): void;
  getCameraController(): CameraController;
  screenshot(): Promise<Blob>;
  dispose(): void;
}

export interface ViewerBackend {
  id: string;
  supports(features: string[]): boolean;
  mount(container: HTMLElement, options: ViewerMountOptions): ViewerSession;
}
