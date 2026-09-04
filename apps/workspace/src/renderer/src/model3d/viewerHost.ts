import type { ViewerBackend } from "../../../shared/model3d/viewer";
import { webGlThreeBackend } from "./backends/webglThreeBackend";

const backends = new Map<string, ViewerBackend>([[webGlThreeBackend.id, webGlThreeBackend]]);

export function registerViewerBackend(backend: ViewerBackend): void {
  backends.set(backend.id, backend);
}

export function getViewerBackend(id = "webgl-three"): ViewerBackend {
  const backend = backends.get(id);
  if (!backend) throw new Error(`Viewer backend not found: ${id}`);
  return backend;
}

export function getDefaultViewerBackend(): ViewerBackend {
  return getViewerBackend("webgl-three");
}
