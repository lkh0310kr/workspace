import { useWorkspaceScope } from "../interaction/useWorkspaceScope";

/** Workspace tab whose layout host should be visible and interactive. */
export function useVisibleWorkspaceTab(): number {
  return useWorkspaceScope().visibleWorkspaceTabId;
}
