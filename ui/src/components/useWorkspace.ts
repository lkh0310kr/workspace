import { useEffect, useState } from "react";
import {
  WorkspaceState,
  getWorkspaceState,
  onWorkspaceUpdated,
} from "../tauri";

export function useWorkspace(): WorkspaceState | null {
  const [state, setState] = useState<WorkspaceState | null>(null);

  useEffect(() => {
    getWorkspaceState().then(setState).catch(console.error);
    const unlisten = onWorkspaceUpdated((s) => setState(s));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return state;
}
