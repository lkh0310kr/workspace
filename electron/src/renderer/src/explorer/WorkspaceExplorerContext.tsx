import { createContext, useContext, type ReactNode } from "react";
import type { SidebarMode } from "./explorerSidebarChrome";

export interface WorkspaceExplorerChrome {
  treeOpen: boolean;
  treeWidth: number;
  sidebarMode: SidebarMode;
  setTreeOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setTreeWidth: (next: number | ((prev: number) => number)) => void;
  setSidebarMode: (mode: SidebarMode) => void;
}

const WorkspaceExplorerContext = createContext<WorkspaceExplorerChrome | null>(null);

export function WorkspaceExplorerProvider({
  value,
  children,
}: {
  value: WorkspaceExplorerChrome;
  children: ReactNode;
}) {
  return <WorkspaceExplorerContext.Provider value={value}>{children}</WorkspaceExplorerContext.Provider>;
}

export function useWorkspaceExplorerChrome(): WorkspaceExplorerChrome {
  const ctx = useContext(WorkspaceExplorerContext);
  if (!ctx) {
    throw new Error("useWorkspaceExplorerChrome must be used within WorkspaceExplorerProvider");
  }
  return ctx;
}

/** Pane chrome toggle — no-op when explorer provider is absent (tests). */
export function useWorkspaceExplorerChromeOptional(): WorkspaceExplorerChrome | null {
  return useContext(WorkspaceExplorerContext);
}
