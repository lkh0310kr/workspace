import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { initWorkspaceStore } from "../store/installWorkspaceStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { WorkspaceState } from "../electron";

export function useWorkspace(): WorkspaceState | null {
  const workspace = useWorkspaceStore(
    useShallow((s) =>
      s.hydrated ? { tabs: s.tabs, active_tab_id: s.activeTabId } : null,
    ),
  );

  useEffect(() => {
    initWorkspaceStore().catch(console.error);
  }, []);

  return workspace;
}
