import type { ManagedPane, ManagedPaneInternal } from "./pane-manager-types";
import { safeFit } from "./pane-fit";
import { attachWebgl, shouldUseTerminalWebgl } from "./pane-webgl-renderer";
import { rebuildAttachedWebgl } from "./pane-webgl-reattach";

/** Fit the pane, rebuild WebGL when attached, and repaint — required after resize. */
export function refitPaneTerminal(pane: ManagedPane): boolean {
  const internal = pane as ManagedPaneInternal;
  const prevCols = internal.lastFitCols;
  const prevRows = internal.lastFitRows;
  if (!safeFit(pane)) {
    if (
      !internal.renderingSuspended &&
      internal.pendingRefitRetryRafId == null &&
      (internal.xtermContainer?.isConnected ?? pane.container.isConnected)
    ) {
      internal.pendingRefitRetryRafId = requestAnimationFrame(() => {
        internal.pendingRefitRetryRafId = null;
        if (!internal.renderingSuspended) refitPaneTerminal(pane);
      });
    }
    return false;
  }

  const cols = pane.terminal.cols;
  const rows = pane.terminal.rows;
  const dimsChanged = cols !== prevCols || rows !== prevRows;
  internal.lastFitCols = cols;
  internal.lastFitRows = rows;

  const needsWebglRebuild =
    internal.webglNeedsRebuildOnResume ||
    (internal.webglAddon && dimsChanged && !internal.webglDisabledAfterContextLoss);

  if (needsWebglRebuild && internal.webglAddon && !internal.webglDisabledAfterContextLoss) {
    rebuildAttachedWebgl(internal);
    internal.webglNeedsRebuildOnResume = false;
  } else if (
    internal.gpuRenderingEnabled &&
    !internal.webglAttachmentDeferred &&
    shouldUseTerminalWebgl(internal) &&
    !internal.webglAddon &&
    cols > 0 &&
    rows > 0
  ) {
    attachWebgl(internal);
    internal.webglNeedsRebuildOnResume = false;
  }

  safeFit(pane);
  if (rows > 0) {
    pane.terminal.refresh(0, rows - 1);
  }
  return true;
}
