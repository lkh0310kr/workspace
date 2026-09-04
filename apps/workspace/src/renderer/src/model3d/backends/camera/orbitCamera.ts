import type { CameraMode, CameraState } from "../../../../../shared/model3d/viewer";

export function createOrbitCameraState(): CameraState {
  return {
    mode: "orbit",
    target: [0, 0, 0],
    distance: 4,
  };
}

export interface OrbitCameraHandle {
  reset(): void;
  setMode(mode: CameraMode): void;
  getState(): CameraState;
}

export function createOrbitCameraHandle(
  resetFn: () => void,
  getStateFn: () => CameraState,
): OrbitCameraHandle {
  let mode: CameraMode = "orbit";
  return {
    reset: resetFn,
    setMode(next) {
      mode = next;
    },
    getState() {
      return { ...getStateFn(), mode };
    },
  };
}
