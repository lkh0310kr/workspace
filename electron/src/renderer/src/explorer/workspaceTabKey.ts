/** Explorer tree + sidebar chrome keyed by workspace tab (not per flexlayout pane). */
export function workspaceTabKey(workspaceTabId: number): string {
  return String(workspaceTabId);
}
