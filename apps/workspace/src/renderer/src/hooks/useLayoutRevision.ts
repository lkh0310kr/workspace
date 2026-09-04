import { useWorkspaceStore } from "../store/workspaceStore";

/** Subscribe to layout model changes for one workspace tab. */
export function useLayoutRevision(tabId: number): number {
  return useWorkspaceStore((s) => s.layoutRevisions[tabId] ?? 0);
}

/** Subscribe to any workspace tab's layout model revision changes. */
export function useLayoutRevisions(): Record<number, number> {
  return useWorkspaceStore((s) => s.layoutRevisions);
}
