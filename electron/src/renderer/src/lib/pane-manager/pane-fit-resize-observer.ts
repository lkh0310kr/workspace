import type { ManagedPaneInternal } from "./pane-manager-types";
import { refitPaneTerminal } from "./pane-terminal-refit";

type FitListener = (pane: ManagedPaneInternal) => void;
const fitListeners = new WeakMap<ManagedPaneInternal, FitListener>();

export function setPaneFitListener(pane: ManagedPaneInternal, listener: FitListener | null): void {
  if (listener) fitListeners.set(pane, listener);
  else fitListeners.delete(pane);
}

export function attachPaneFitResizeObserver(pane: ManagedPaneInternal): void {
  detachPaneFitResizeObserver(pane);
  const fitEl = pane.xtermContainer ?? pane.container;
  const onResize = () => {
    if (!fitEl.isConnected) return;
    if (refitPaneTerminal(pane)) {
      fitListeners.get(pane)?.(pane);
    }
  };
  pane.fitResizeObserver = new ResizeObserver(onResize);
  pane.fitResizeObserver.observe(fitEl);
  window.addEventListener("resize", onResize);
  (pane as ManagedPaneInternal & { windowResizeHandler?: () => void }).windowResizeHandler = onResize;
}

export function detachPaneFitResizeObserver(pane: ManagedPaneInternal): void {
  const extended = pane as ManagedPaneInternal & { windowResizeHandler?: () => void };
  if (extended.windowResizeHandler) {
    window.removeEventListener("resize", extended.windowResizeHandler);
    extended.windowResizeHandler = undefined;
  }
  fitListeners.delete(pane);
  if (pane.fitResizeObserver) {
    pane.fitResizeObserver.disconnect();
    pane.fitResizeObserver = null;
  }
}
