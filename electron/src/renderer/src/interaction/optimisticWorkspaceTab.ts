/** Workspace tab id being switched via rail before workspace IPC confirms. */
let optimisticWorkspaceTabId: number | null = null;

export function beginOptimisticWorkspaceTabSwitch(tabId: number): void {
  optimisticWorkspaceTabId = tabId;
}

export function endOptimisticWorkspaceTabSwitch(): void {
  optimisticWorkspaceTabId = null;
}

export function getOptimisticWorkspaceTabId(): number | null {
  return optimisticWorkspaceTabId;
}
