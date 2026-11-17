import { usePaneSystemStore } from '../state/paneSystemStore'

/** Subscribe to layout model changes for one workspace tab. */
export function useLayoutRevision(tabId: number): number {
  return usePaneSystemStore((s) => s.layoutRevisions[tabId] ?? 0)
}

/** Subscribe to active chip changes for one pane without invalidating sibling panes. */
export function usePaneTabSelectionRevision(workspaceTabId: number, nodeId: string): number {
  return usePaneSystemStore((s) => s.paneTabSelectionRevisions[`${workspaceTabId}:${nodeId}`] ?? 0)
}

/** Subscribe to any workspace tab's layout model revision changes. */
export function useLayoutRevisions(): Record<number, number> {
  return usePaneSystemStore((s) => s.layoutRevisions)
}
