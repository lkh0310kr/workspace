import { useEffect, useState } from "react";
import {
  WorkspaceState,
  getWorkspaceState,
  onWorkspaceUpdated,
} from "../electron";

export function useWorkspace(): WorkspaceState | null {
  const [state, setState] = useState<WorkspaceState | null>(null);

  useEffect(() => {
    getWorkspaceState().then(setState).catch(console.error);
    const unlisten = onWorkspaceUpdated((s) => setState(s));
    return unlisten;
  }, []);

  return state;
}
