import type { ManagedPaneInternal } from "./pane-manager-types";

// Why: flexlayout owns tab-group DOM reparenting outside React's render
// cycle (imperative appendChild on split/move — see flexlayout-react's
// TabNode.moveableElement). Code that reacts to those moves (split scroll
// restore) needs to reach a live pane by terminalId from outside the
// TerminalPane component that owns it.
const paneRegistry = new Map<number, ManagedPaneInternal>();

export function registerTerminalPane(terminalId: number, pane: ManagedPaneInternal): void {
  paneRegistry.set(terminalId, pane);
}

export function unregisterTerminalPane(terminalId: number, pane: ManagedPaneInternal): void {
  if (paneRegistry.get(terminalId) === pane) {
    paneRegistry.delete(terminalId);
  }
}

export function getRegisteredTerminalPane(terminalId: number): ManagedPaneInternal | undefined {
  return paneRegistry.get(terminalId);
}
