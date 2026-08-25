import { useEffect } from "react";
import { initWorkspaceStore } from "../store/installWorkspaceStore";
import { selectWorkspaceState, useWorkspaceStore } from "../store/workspaceStore";
import type { WorkspaceState } from "../electron";

let storeBooted = false;

export function useWorkspace(): WorkspaceState | null {
  const workspace = useWorkspaceStore(selectWorkspaceState);

  useEffect(() => {
    if (storeBooted) return;
    storeBooted = true;
    initWorkspaceStore().catch(console.error);
  }, []);

  return workspace;
}
