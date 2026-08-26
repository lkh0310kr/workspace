/** Workspace tab id being switched via rail before workspace IPC confirms. */
let optimisticWorkspaceTabId: number | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyOptimisticWorkspaceTab(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeOptimisticWorkspaceTab(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginOptimisticWorkspaceTabSwitch(tabId: number): void {
  optimisticWorkspaceTabId = tabId;
  notifyOptimisticWorkspaceTab();
}

export function endOptimisticWorkspaceTabSwitch(): void {
  if (optimisticWorkspaceTabId === null) return;
  optimisticWorkspaceTabId = null;
  notifyOptimisticWorkspaceTab();
}

export function getOptimisticWorkspaceTabId(): number | null {
  return optimisticWorkspaceTabId;
}
