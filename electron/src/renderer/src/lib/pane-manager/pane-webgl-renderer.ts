import { WebglAddon } from "@xterm/addon-webgl";
import type { ManagedPaneInternal } from "./pane-manager-types";
import { safeFit } from "./pane-rendering-control";

export const ENABLE_WEBGL_RENDERER = true;
let suggestedRendererType: "dom" | undefined;

export function shouldUseTerminalWebgl(pane: ManagedPaneInternal): boolean {
  if (pane.terminalGpuAcceleration === "on") return true;
  if (pane.terminalGpuAcceleration === "off") return false;
  return suggestedRendererType !== "dom";
}

export function attachWebgl(pane: ManagedPaneInternal): void {
  if (
    !ENABLE_WEBGL_RENDERER ||
    !pane.gpuRenderingEnabled ||
    !shouldUseTerminalWebgl(pane) ||
    pane.webglAttachmentDeferred ||
    pane.webglDisabledAfterContextLoss ||
    pane.webglAttachFailedSinceRecovery
  ) {
    disposeWebgl(pane);
    return;
  }
  if (pane.terminal.cols < 1 || pane.terminal.rows < 1) {
    return;
  }
  disposeWebgl(pane);
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => {
      pane.webglDisabledAfterContextLoss = true;
      disposeWebgl(pane, { refreshDimensions: true });
    });
    pane.terminal.loadAddon(addon);
    pane.webglAddon = addon;
    const rows = pane.terminal.rows;
    if (rows > 0) {
      pane.terminal.refresh(0, rows - 1);
    }
    if (pane.pendingWebglRefreshRafId != null) {
      cancelAnimationFrame(pane.pendingWebglRefreshRafId);
    }
    // DOM → WebGL after hide/show needs a settled frame before the atlas paints.
    pane.pendingWebglRefreshRafId = requestAnimationFrame(() => {
      pane.pendingWebglRefreshRafId = null;
      if (pane.terminal.rows > 0) {
        pane.terminal.refresh(0, pane.terminal.rows - 1);
      }
    });
  } catch (err) {
    if (pane.terminalGpuAcceleration === "auto") suggestedRendererType = "dom";
    pane.webglAttachFailedSinceRecovery = true;
    console.warn("[terminal] WebGL unavailable — using DOM renderer:", err);
    pane.webglAddon = null;
  }
}

export function disposeWebgl(
  pane: ManagedPaneInternal,
  opts?: { refreshDimensions?: boolean },
): void {
  if (pane.pendingWebglRefreshRafId != null) {
    cancelAnimationFrame(pane.pendingWebglRefreshRafId);
    pane.pendingWebglRefreshRafId = null;
  }
  if (pane.webglAddon) {
    try {
      pane.webglAddon.dispose();
    } catch {
      /* ignore */
    }
    pane.webglAddon = null;
  }
  if (opts?.refreshDimensions) {
    safeFit(pane);
  }
}

export function cancelPendingWebglRefresh(pane: ManagedPaneInternal): void {
  if (pane.pendingWebglRefreshRafId != null) {
    cancelAnimationFrame(pane.pendingWebglRefreshRafId);
    pane.pendingWebglRefreshRafId = null;
  }
}
