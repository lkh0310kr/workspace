import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { initWorkspaceStore } from './runtime/installWorkspaceStore'
import { useWorkspaceStore } from './state/workspaceStore'
import type { WorkspaceState } from './runtime/workspaceApi'

export function useWorkspace(): WorkspaceState | null {
  const workspace = useWorkspaceStore(
    useShallow((s) => (s.hydrated ? { tabs: s.tabs, active_tab_id: s.activeTabId } : null))
  )

  useEffect(() => {
    initWorkspaceStore().catch(console.error)
  }, [])

  return workspace
}
