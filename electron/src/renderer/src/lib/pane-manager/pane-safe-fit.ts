import type { ManagedPane } from "./pane-manager-types";
import { notifyPaneFitSucceeded } from "./pane-fit-webgl-attach-signal";

function getFitElement(pane: ManagedPane): HTMLElement {
  const internal = pane as ManagedPane & { xtermContainer?: HTMLElement };
  return internal.xtermContainer ?? pane.container;
}

export function safeFit(pane: ManagedPane): boolean {
  const fitEl = getFitElement(pane);
  if (!fitEl.isConnected) {
    return false;
  }
  const { clientWidth, clientHeight } = fitEl;
  if (clientWidth < 2 || clientHeight < 2) {
    return false;
  }
  try {
    pane.fitAddon.fit();
    notifyPaneFitSucceeded(pane);
    return true;
  } catch {
    return false;
  }
}

export function safeFitAndThen(
  pane: ManagedPane,
  _operationKey: string,
  continuation: () => void,
): { completed: Promise<boolean> } {
  const completed = safeFit(pane);
  if (completed) {
    continuation();
  }
  return { completed: Promise.resolve(completed) };
}
