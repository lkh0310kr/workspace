import type { ManagedPane, ManagedPaneInternal } from "./pane-manager-types";
import { safeFit } from "./pane-rendering-control";
import { attachWebgl, disposeWebgl, shouldUseTerminalWebgl } from "./pane-webgl-renderer";

export function rebuildAttachedWebgl(pane: ManagedPaneInternal): void {
  if (!pane.webglAddon || pane.webglDisabledAfterContextLoss || pane.webglAttachmentDeferred) {
    return;
  }
  disposeWebgl(pane);
  pane.webglAttachFailedSinceRecovery = false;
  attachWebgl(pane);
}

/** Fit the pane, rebuild WebGL when attached, and repaint — required after resize. */
export function refitPaneTerminal(pane: ManagedPane): boolean {
  const internal = pane as ManagedPaneInternal;
  if (!safeFit(pane)) return false;

  if (internal.webglAddon && !internal.webglDisabledAfterContextLoss) {
    rebuildAttachedWebgl(internal);
  } else if (
    internal.gpuRenderingEnabled &&
    !internal.webglAttachmentDeferred &&
    shouldUseTerminalWebgl(internal) &&
    pane.terminal.cols > 0 &&
    pane.terminal.rows > 0
  ) {
    attachWebgl(internal);
  }

  safeFit(pane);
  if (pane.terminal.rows > 0) {
    pane.terminal.refresh(0, pane.terminal.rows - 1);
  }
  return true;
}
