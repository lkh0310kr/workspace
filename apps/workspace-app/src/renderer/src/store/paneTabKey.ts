export function paneTabStoreKey(workspaceTabId: number, flexlayoutNodeId: string): string {
  return `${workspaceTabId}:${flexlayoutNodeId}`;
}
