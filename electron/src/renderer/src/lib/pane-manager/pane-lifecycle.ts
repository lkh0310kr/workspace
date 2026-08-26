import type { ManagedPaneInternal } from "./pane-manager-types";
import { activateOrcaTerminalUnicodeProvider } from "../shared/terminal-unicode-provider";
import { attachPaneFitResizeObserver, detachPaneFitResizeObserver } from "./pane-fit-resize-observer";
import { attachDomRendererFocusClassSync } from "./pane-dom-focus-class-sync";
import { safeFit } from "./pane-safe-fit";
import { cancelPendingWebglRefresh, disposeWebgl, attachWebgl } from "./pane-webgl-renderer";
import { clearTerminalOutputQueue } from "./pane-terminal-output-scheduler";
import { installTerminalImeCandidateAnchor } from "./terminal-ime-candidate-anchor";
import { attachTerminalMouseWheelMultiplier } from "./pane-terminal-mouse-wheel";
import { installTerminalWheelScroll } from "../../terminal/terminal-wheel-scroll";
import {
  installTerminalLinkifierHoverResetOnMouseLeave,
  installTerminalLinkifierHoverResetOnWindowBlur,
} from "./terminal-linkifier-hover-reset-on-mouseleave";
import { installTerminalLinkifierHoverResetOnWrite } from "./terminal-linkifier-hover-reset-on-write";

export { createPaneDOM } from "./pane-dom-creation";

export function openTerminal(pane: ManagedPaneInternal): void {
  const {
    terminal,
    container,
    xtermContainer,
    linkTooltip,
    fitAddon,
    searchAddon,
    serializeAddon,
    unicode11Addon,
    webLinksAddon,
  } = pane;

  terminal.open(xtermContainer);
  container.appendChild(linkTooltip);

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(serializeAddon);
  terminal.loadAddon(unicode11Addon);
  terminal.unicode.activeVersion = "11";
  terminal.loadAddon(webLinksAddon);

  attachTerminalMouseWheelMultiplier(terminal);
  pane.wheelScrollCleanup = installTerminalWheelScroll(terminal);
  pane.linkifierHoverResetDisposable = installTerminalLinkifierHoverResetOnWrite(terminal);
  pane.linkifierMouseLeaveResetDisposable = installTerminalLinkifierHoverResetOnMouseLeave(
    terminal,
    linkTooltip,
  );
  pane.linkifierWindowBlurResetDisposable = installTerminalLinkifierHoverResetOnWindowBlur(
    terminal,
    linkTooltip,
  );

  activateOrcaTerminalUnicodeProvider(terminal);

  pane.compositionHandler = installTerminalImeCandidateAnchor(terminal);
  pane.focusClassSyncCleanup = attachDomRendererFocusClassSync(terminal.element);

  if (pane.gpuRenderingEnabled) {
    attachWebgl(pane);
  }

  attachPaneFitResizeObserver(pane);

  if (pane.pendingInitialFitRafId != null) {
    cancelAnimationFrame(pane.pendingInitialFitRafId);
  }
  pane.pendingInitialFitRafId = requestAnimationFrame(() => {
    pane.pendingInitialFitRafId = null;
    safeFit(pane);
  });
}

export function disposePane(pane: ManagedPaneInternal): void {
  if (pane.pendingInitialFitRafId != null) {
    cancelAnimationFrame(pane.pendingInitialFitRafId);
    pane.pendingInitialFitRafId = null;
  }
  if (pane.pendingRefitRetryRafId != null) {
    cancelAnimationFrame(pane.pendingRefitRetryRafId);
    pane.pendingRefitRetryRafId = null;
  }
  pane.focusClassSyncCleanup?.();
  pane.focusClassSyncCleanup = null;
  pane.wheelScrollCleanup?.();
  pane.wheelScrollCleanup = null;
  pane.linkifierHoverResetDisposable?.dispose();
  pane.linkifierHoverResetDisposable = null;
  pane.linkifierMouseLeaveResetDisposable?.dispose();
  pane.linkifierMouseLeaveResetDisposable = null;
  pane.linkifierWindowBlurResetDisposable?.dispose();
  pane.linkifierWindowBlurResetDisposable = null;
  pane.compositionHandler?.();
  pane.compositionHandler = null;
  detachPaneFitResizeObserver(pane);
  cancelPendingWebglRefresh(pane);
  disposeWebgl(pane);
  clearTerminalOutputQueue(pane.terminal);
  try {
    pane.terminal.clearSelection();
  } catch {
    /* ignore */
  }
  try {
    pane.terminal.dispose();
  } catch {
    /* ignore */
  }
}
