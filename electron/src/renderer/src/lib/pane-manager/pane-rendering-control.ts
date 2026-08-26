import type { ManagedPane, ManagedPaneInternal } from "./pane-manager-types";
import { safeFit } from "./pane-safe-fit";
import { disposeWebgl } from "./pane-webgl-renderer";
import { rebuildAttachedWebgl } from "./pane-webgl-reattach";
import { repairPaneWebglCanvasDprMismatch } from "./terminal-canvas-dpr-repair";

export { safeFit, safeFitAndThen } from "./pane-safe-fit";

export function suspendPaneRendering(pane: ManagedPaneInternal): void {
  pane.renderingSuspended = true;
  pane.webglAttachmentDeferred = true;
  pane.webglNeedsRebuildOnResume = true;
  disposeWebgl(pane);
}

export function resumePaneRendering(pane: ManagedPaneInternal): void {
  pane.renderingSuspended = false;
  pane.webglAttachmentDeferred = false;
  pane.webglDisabledAfterContextLoss = false;
  pane.webglAttachFailedSinceRecovery = false;
  if (pane.webglRebuildDeferred) {
    pane.webglRebuildDeferred = false;
    rebuildAttachedWebgl(pane);
  }
  repairPaneWebglCanvasDprMismatch(pane);
}
