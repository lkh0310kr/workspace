import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { TabInfo, WorkspaceState } from '../runtime/workspaceApi'

function tabsDataEqual(a: TabInfo[], b: TabInfo[]): boolean {
  if (a.length !== b.length) return false
  return a.every((t, i) => {
    const u = b[i]
    return (
      t.id === u.id &&
      t.title === u.title &&
      layoutJsonEquivalent(t.layout_json, u.layout_json) &&
      t.root_path === u.root_path
    )
  })
}

function layoutJsonEquivalent(saved: string | undefined, incoming: string): boolean {
  if (saved === incoming) return true
  if (!saved) return false
  try {
    return JSON.stringify(JSON.parse(saved)) === JSON.stringify(JSON.parse(incoming))
  } catch {
    return saved === incoming
  }
}

export type WorkspaceStoreState = {
  hydrated: boolean
  tabs: TabInfo[]
  activeTabId: number
}

type WorkspaceStoreActions = {
  hydrateFromWorkspace: (ws: WorkspaceState) => boolean
}

export const useWorkspaceStore = create<WorkspaceStoreState & WorkspaceStoreActions>()(
  subscribeWithSelector((set, get) => ({
    hydrated: false,
    tabs: [],
    activeTabId: 0,

    hydrateFromWorkspace(ws: WorkspaceState): boolean {
      const prev = get()
      const tabsPreserved = prev.hydrated && tabsDataEqual(prev.tabs, ws.tabs)
      const nextTabs = tabsPreserved ? prev.tabs : ws.tabs
      set({
        hydrated: true,
        tabs: nextTabs,
        activeTabId: ws.active_tab_id
      })
      return !tabsPreserved
    }
  }))
)

export function selectWorkspaceState(store: WorkspaceStoreState): WorkspaceState | null {
  if (!store.hydrated) return null
  return { tabs: store.tabs, active_tab_id: store.activeTabId }
}
