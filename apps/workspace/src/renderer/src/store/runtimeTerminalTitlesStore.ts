import { create } from 'zustand'

type State = {
  titlesByWorkspaceTab: Record<number, Record<string, string>>
  revision: number
}

type Actions = {
  setRuntimePaneTitle: (workspaceTabId: number, paneTabId: string, title: string) => void
  clearWorkspaceTab: (workspaceTabId: number) => void
}

export const useRuntimeTerminalTitlesStore = create<State & Actions>((set) => ({
  titlesByWorkspaceTab: {},
  revision: 0,

  setRuntimePaneTitle(workspaceTabId, paneTabId, title) {
    set((state) => {
      const tabMap = state.titlesByWorkspaceTab[workspaceTabId] ?? {}
      if (tabMap[paneTabId] === title) return state
      return {
        titlesByWorkspaceTab: {
          ...state.titlesByWorkspaceTab,
          [workspaceTabId]: { ...tabMap, [paneTabId]: title },
        },
        revision: state.revision + 1,
      }
    })
  },

  clearWorkspaceTab(workspaceTabId) {
    set((state) => {
      if (!state.titlesByWorkspaceTab[workspaceTabId]) return state
      const next = { ...state.titlesByWorkspaceTab }
      delete next[workspaceTabId]
      return { titlesByWorkspaceTab: next, revision: state.revision + 1 }
    })
  },
}))
