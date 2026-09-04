import type { ManagedPaneInternal } from "./pane-manager-types";
import { attachWebgl, clearTerminalWebglAttachBackoff, disposeWebgl } from "./pane-webgl-renderer";

export function reattachWebglIfNeeded(pane: ManagedPaneInternal): void {
  if (pane.gpuRenderingEnabled && !pane.webglAddon && !pane.webglDisabledAfterContextLoss) {
    attachWebgl(pane);
  }
}

export function rebuildAttachedWebgl(pane: ManagedPaneInternal): void {
  if (!pane.webglAddon || pane.webglDisabledAfterContextLoss) {
    return;
  }
  if (pane.webglAttachmentDeferred) {
    pane.webglRebuildDeferred = true;
    return;
  }
  pane.webglRebuildDeferred = false;
  disposeWebgl(pane);
  clearTerminalWebglAttachBackoff(pane);
  attachWebgl(pane);
}
