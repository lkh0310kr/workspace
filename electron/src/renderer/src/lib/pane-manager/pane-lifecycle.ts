import type { ManagedPaneInternal } from "./pane-manager-types";
import { activateOrcaTerminalUnicodeProvider } from "../shared/terminal-unicode-provider";
import { attachPaneFitResizeObserver, detachPaneFitResizeObserver } from "./pane-fit-resize-observer";
import { cancelPendingWebglRefresh, disposeWebgl } from "./pane-webgl-renderer";
import { refitPaneTerminal } from "./pane-terminal-refit";
import { clearTerminalOutputQueue } from "./pane-terminal-output-scheduler";

export { createPaneDOM } from "./pane-dom-creation";

const MAX_INITIAL_FIT_ATTEMPTS = 120;

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

  attachPaneFitResizeObserver(pane);

  if (pane.pendingInitialFitRafId != null) {
    cancelAnimationFrame(pane.pendingInitialFitRafId);
  }
  let attempts = 0;
  const runInitialFit = () => {
    attempts++;
    if (refitPaneTerminal(pane)) {
      return;
    }
    if (attempts >= MAX_INITIAL_FIT_ATTEMPTS) return;
    pane.pendingInitialFitRafId = requestAnimationFrame(() => {
      pane.pendingInitialFitRafId = null;
      runInitialFit();
    });
  };
  pane.pendingInitialFitRafId = requestAnimationFrame(() => {
    pane.pendingInitialFitRafId = null;
    runInitialFit();
  });
}

export function disposePane(pane: ManagedPaneInternal): void {
  if (pane.pendingInitialFitRafId != null) {
    cancelAnimationFrame(pane.pendingInitialFitRafId);
    pane.pendingInitialFitRafId = null;
  }
  detachPaneFitResizeObserver(pane);
  cancelPendingWebglRefresh(pane);
  disposeWebgl(pane);
  clearTerminalOutputQueue(pane.terminal);
  try {
    pane.terminal.dispose();
  } catch {
    /* ignore */
  }
}
