import { WebglAddon } from "@xterm/addon-webgl";
import type { ManagedPane, ManagedPaneInternal } from "./pane-manager-types";
import { recordTerminalWebglDiagnostic } from "../../../../shared/terminal-webgl-diagnostics";
import { getLivePaneCensus } from "./pane-manager-registry";
import { isManagedPaneDisplayNone } from "./pane-display-visibility";
import {
  forceFullViewportPresent,
  requestFullViewportPresent,
} from "./terminal-render-pause-release";
import {
  getTerminalWebglAutoDecision,
  resetTerminalWebglAutoDecision,
} from "./terminal-webgl-auto-policy";
import { safeFit, safeFitAndThen } from "./pane-fit";
import { setPaneFitWebglAttachHook } from "./pane-fit-webgl-attach-signal";
import { repairPaneWebglCanvasDprMismatch } from "./terminal-canvas-dpr-repair";

export const ENABLE_WEBGL_RENDERER = true;
let suggestedRendererType: "dom" | undefined;

type ReleasableWebglContext = {
  getExtension(name: "WEBGL_lose_context"): WEBGL_lose_context | null;
  isContextLost?: () => boolean;
};

type XtermWebglAddonInternals = {
  _renderer?: {
    _gl?: ReleasableWebglContext;
    _canvas?: HTMLCanvasElement;
  };
};

export function resetTerminalWebglSuggestion(): void {
  suggestedRendererType = undefined;
  resetTerminalWebglAutoDecision();
}

export function clearTerminalWebglAttachBackoff(pane: ManagedPaneInternal): void {
  pane.webglAttachFailedSinceRecovery = false;
}

export function shouldUseTerminalWebgl(pane: ManagedPaneInternal): boolean {
  if (pane.terminalGpuAcceleration === "on") {
    return true;
  }
  if (pane.terminalGpuAcceleration !== "auto" || suggestedRendererType === "dom") {
    return false;
  }
  return getTerminalWebglAutoDecision().allowWebgl;
}

function refreshTerminalAfterWebglAttach(pane: ManagedPaneInternal): void {
  try {
    pane.terminal.refresh(0, pane.terminal.rows - 1);
  } catch {
    /* ignore */
  }
}

export function cancelPendingWebglRefresh(pane: ManagedPaneInternal): void {
  if (pane.pendingWebglRefreshRafId == null) {
    return;
  }
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(pane.pendingWebglRefreshRafId);
  }
  pane.pendingWebglRefreshRafId = null;
}

export function isPaneWebglContextLost(pane: ManagedPaneInternal): boolean {
  try {
    const renderer = (pane.webglAddon as unknown as XtermWebglAddonInternals | null)?._renderer;
    return renderer?._gl?.isContextLost?.() === true;
  } catch {
    return true;
  }
}

export function disposeWebgl(
  pane: ManagedPaneInternal,
  options?: { refreshDimensions?: boolean },
): void {
  cancelPendingWebglRefresh(pane);
  if (!pane.webglAddon) {
    return;
  }
  releaseXtermWebglContext(pane.webglAddon);
  try {
    pane.webglAddon.dispose();
  } catch {
    /* ignore */
  }
  pane.webglAddon = null;
  if (options?.refreshDimensions) {
    pane.pendingWebglRefreshRafId = requestAnimationFrame(() => {
      pane.pendingWebglRefreshRafId = null;
      try {
        safeFitAndThen(pane, "webgl-fallback-refresh", () => {
          pane.terminal.refresh(0, pane.terminal.rows - 1);
        });
      } catch {
        /* ignore */
      }
    });
  }
}

function releaseXtermWebglContext(webglAddon: ManagedPaneInternal["webglAddon"]): void {
  try {
    const renderer = (webglAddon as unknown as XtermWebglAddonInternals | null)?._renderer;
    renderer?._gl?.getExtension("WEBGL_lose_context")?.loseContext();
    if (renderer?._canvas) {
      renderer._canvas.width = 0;
      renderer._canvas.height = 0;
    }
  } catch {
    /* ignore */
  }
}

export function markComplexScriptOutput(pane: ManagedPaneInternal): void {
  pane.hasComplexScriptOutput = true;
}

export function clearWebglTextureAtlas(pane: ManagedPaneInternal): void {
  if (pane.webglDisabledAfterContextLoss) {
    return;
  }
  try {
    pane.webglAddon?.clearTextureAtlas();
  } catch {
    /* ignore */
  }
}

const DISPLAYED_PRESENT_RETRY_FRAMES = 16;
type ViewportPresentMode = "preserve-synchronized-output" | "force-current-buffer";
type DisplayedPresentRetry = { frames: number; mode: ViewportPresentMode };
const pendingDisplayedPresentRetries = new WeakMap<ManagedPaneInternal, DisplayedPresentRetry>();

function schedulePresentWhenDisplayed(pane: ManagedPaneInternal, mode: ViewportPresentMode): void {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    return;
  }
  const pending = pendingDisplayedPresentRetries.get(pane);
  if (pending) {
    if (mode === "force-current-buffer") {
      pending.mode = mode;
    }
    return;
  }
  pendingDisplayedPresentRetries.set(pane, {
    frames: DISPLAYED_PRESENT_RETRY_FRAMES,
    mode,
  });
  const tick = (): void => {
    const retry = pendingDisplayedPresentRetries.get(pane);
    if (!retry || retry.frames <= 0 || !pane.terminal) {
      pendingDisplayedPresentRetries.delete(pane);
      return;
    }
    if (isManagedPaneDisplayNone(pane)) {
      if (retry.frames === 1) {
        pendingDisplayedPresentRetries.delete(pane);
        return;
      }
      retry.frames -= 1;
      globalThis.requestAnimationFrame(tick);
      return;
    }
    pendingDisplayedPresentRetries.delete(pane);
    presentPaneViewportWithMode(pane, retry.mode);
  };
  globalThis.requestAnimationFrame(tick);
}

function presentPaneViewportWithMode(pane: ManagedPane, mode: ViewportPresentMode): void {
  const internal = pane as ManagedPaneInternal;
  if (internal.webglDisabledAfterContextLoss) {
    return;
  }
  try {
    if (isManagedPaneDisplayNone(pane)) {
      pane.terminal.refresh(0, pane.terminal.rows - 1);
      schedulePresentWhenDisplayed(internal, mode);
      return;
    }
    const presented =
      mode === "force-current-buffer"
        ? forceFullViewportPresent(pane.terminal)
        : requestFullViewportPresent(pane.terminal);
    if (!presented) {
      pane.terminal.refresh(0, pane.terminal.rows - 1);
    }
  } catch {
    /* ignore */
  }
}

export function presentPaneViewport(pane: ManagedPane): void {
  presentPaneViewportWithMode(pane, "force-current-buffer");
}

export function presentPaneViewportPreservingSynchronizedOutput(pane: ManagedPane): void {
  presentPaneViewportWithMode(pane, "preserve-synchronized-output");
}

export function resetWebglTextureAtlas(pane: ManagedPaneInternal): void {
  clearWebglTextureAtlas(pane);
  presentPaneViewport(pane);
}

function refitAfterFitAnchoredWebglAttach(pane: ManagedPaneInternal): void {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    return;
  }
  pane.pendingWebglRefreshRafId = globalThis.requestAnimationFrame(() => {
    pane.pendingWebglRefreshRafId = null;
    try {
      safeFit(pane);
    } catch {
      /* ignore */
    }
  });
}

export function attachWebglAfterFitIfMissing(pane: ManagedPaneInternal): void {
  if (
    !pane.webglAddon &&
    pane.gpuRenderingEnabled &&
    !pane.webglAttachmentDeferred &&
    !pane.webglDisabledAfterContextLoss &&
    !pane.webglAttachFailedSinceRecovery &&
    shouldUseTerminalWebgl(pane)
  ) {
    attachWebgl(pane);
    if (pane.webglAddon) {
      recordTerminalWebglDiagnostic("webgl-fit-attach", { paneId: pane.id });
      refitAfterFitAnchoredWebglAttach(pane);
    }
  }
}

setPaneFitWebglAttachHook((pane) => {
  attachWebglAfterFitIfMissing(pane);
  repairPaneWebglCanvasDprMismatch(pane);
});

export function attachWebgl(pane: ManagedPaneInternal): void {
  if (
    !ENABLE_WEBGL_RENDERER ||
    !pane.gpuRenderingEnabled ||
    !shouldUseTerminalWebgl(pane) ||
    pane.webglAttachmentDeferred ||
    pane.webglDisabledAfterContextLoss ||
    pane.webglAttachFailedSinceRecovery
  ) {
    disposeWebgl(pane, { refreshDimensions: true });
    return;
  }
  disposeWebgl(pane);
  let webglAddon: WebglAddon | null = null;
  try {
    webglAddon = new WebglAddon();
    const addon = webglAddon;
    addon.onContextLoss(() => {
      console.warn(
        "[terminal] WebGL context lost for pane",
        pane.id,
        "— falling back to DOM renderer",
      );
      const census = getLivePaneCensus();
      recordTerminalWebglDiagnostic("webgl-context-loss", {
        paneId: pane.id,
        livePanes: census.panes,
        livePaneManagers: census.managers,
      });
      pane.webglDisabledAfterContextLoss = true;
      disposeWebgl(pane, { refreshDimensions: true });
    });
    pane.terminal.loadAddon(addon);
    pane.webglAddon = addon;
    refreshTerminalAfterWebglAttach(pane);
  } catch (err) {
    if (pane.terminalGpuAcceleration === "auto") {
      suggestedRendererType = "dom";
    }
    pane.webglAttachFailedSinceRecovery = true;
    console.warn("[terminal] WebGL unavailable for pane", pane.id, "— using DOM renderer:", err);
    try {
      webglAddon?.dispose();
    } catch {
      /* ignore */
    }
    pane.webglAddon = null;
  }
}
