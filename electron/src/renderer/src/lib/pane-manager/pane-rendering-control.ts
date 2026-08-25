import type { ManagedPane, ManagedPaneInternal } from "./pane-manager-types";
import { disposeWebgl } from "./pane-webgl-renderer";

function getFitElement(pane: ManagedPane): HTMLElement {
  const internal = pane as ManagedPaneInternal;
  return internal.xtermContainer ?? pane.container;
}

export function safeFit(pane: ManagedPane): boolean {
  const fitEl = getFitElement(pane);
  const { clientWidth, clientHeight } = fitEl;
  if (clientWidth < 2 || clientHeight < 2) return false;
  try {
    pane.fitAddon.fit();
    return true;
  } catch {
    return false;
  }
}

export function suspendPaneRendering(pane: ManagedPaneInternal): void {
  pane.renderingSuspended = true;
  pane.webglAttachmentDeferred = true;
  disposeWebgl(pane);
}

export function resumePaneRendering(pane: ManagedPaneInternal): void {
  pane.renderingSuspended = false;
  pane.webglAttachmentDeferred = false;
  pane.webglDisabledAfterContextLoss = false;
  pane.webglAttachFailedSinceRecovery = false;
}
