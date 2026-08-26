import type { ManagedPaneInternal } from "./pane-manager-types";
import { activateOrcaTerminalUnicodeProvider } from "../shared/terminal-unicode-provider";
import { attachPaneFitResizeObserver, detachPaneFitResizeObserver } from "./pane-fit-resize-observer";
import { attachDomRendererFocusClassSync } from "./pane-dom-focus-class-sync";
import { safeFit } from "./pane-rendering-control";
import { cancelPendingWebglRefresh, disposeWebgl, attachWebgl, shouldUseTerminalWebgl } from "./pane-webgl-renderer";
import { clearTerminalOutputQueue } from "./pane-terminal-output-scheduler";
import { installTerminalImeCandidateAnchor } from "./terminal-ime-candidate-anchor";
import { installTerminalWheelScroll } from "../../terminal/terminal-wheel-scroll";

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

  activateOrcaTerminalUnicodeProvider(terminal);

  pane.compositionHandler = installTerminalImeCandidateAnchor(terminal);
  pane.focusClassSyncCleanup = attachDomRendererFocusClassSync(terminal.element);
  pane.wheelScrollCleanup = installTerminalWheelScroll(terminal);

  if (shouldUseTerminalWebgl(pane)) {
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
  pane.compositionHandler?.();
  pane.compositionHandler = null;
  pane.wheelScrollCleanup?.();
  pane.wheelScrollCleanup = null;
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
