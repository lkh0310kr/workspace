import { create } from 'zustand'
import type { Model } from 'flexlayout-react'
import { countLayoutTabs, modelFromLayoutJson } from '../layout/layoutModelParse'
import { layoutLog, layoutLogModel } from '../layout/layoutDebugLog'
import {
  deleteLayoutModel,
  getLayoutModel,
  getSavedLayoutJson,
  layoutModelTabIds,
  markEnsureInflight as markLayoutEnsureInflight,
  setLayoutModel,
  setPendingRebalance as setLayoutPendingRebalance,
  setSavedLayoutJson,
  takePendingRebalance as takeLayoutPendingRebalance,
  clearEnsureInflight as clearLayoutEnsureInflight
} from '../layout/workspaceLayoutModels'

export type WorkspaceLayoutSnapshot = { id: number; layout_json: string }
export type PersistWorkspaceLayout = (tabId: number, layoutJson: string) => Promise<void>

const persistTimers = new Map<number, ReturnType<typeof setTimeout>>()
let persistWorkspaceLayout: PersistWorkspaceLayout | null = null

export function configurePaneSystemLayoutPersistence(adapter: PersistWorkspaceLayout): void {
  persistWorkspaceLayout = adapter
}

export type PaneSystemState = {
  /** Per workspace-tab layout model revision. */
  layoutRevisions: Record<number, number>
  /** Per pane active-tab selection revision. */
  paneTabSelectionRevisions: Record<string, number>
  /** flexlayout tabset id with UI focus for each workspace tab. */
  focusedPaneGroupTabSetByWorkspaceTab: Record<number, string | undefined>
  syncWorkspaceLayouts: (tabs: readonly WorkspaceLayoutSnapshot[]) => void
  getModel: (tabId: number) => Model | undefined
  persistLayout: (tabId: number, model: Model) => void
  setPendingRebalance: (tabId: number, nodeId: string | null) => void
  takePendingRebalance: (tabId: number) => string | null | undefined
  markEnsureInflight: (tabId: number) => boolean
  clearEnsureInflight: (tabId: number) => void
  bumpLayoutRevision: (tabId: number) => void
  bumpPaneTabSelectionRevision: (workspaceTabId: number, nodeId: string) => void
  setFocusedPaneGroupTabSet: (workspaceTabId: number, tabSetId: string) => void
}

export const usePaneSystemStore = create<PaneSystemState>((set, get) => ({
  layoutRevisions: {},
  paneTabSelectionRevisions: {},
  focusedPaneGroupTabSetByWorkspaceTab: {},

  syncWorkspaceLayouts(tabs) {
    const bumpedTabIds = new Set<number>()
    const workspaceTabIds = new Set<number>()
    for (const tab of tabs) {
      workspaceTabIds.add(tab.id)
      const saved = getSavedLayoutJson(tab.id)
      const existing = getLayoutModel(tab.id)
      const emptyModel = existing !== undefined && countLayoutTabs(existing) === 0
      if (layoutJsonEquivalent(saved, tab.layout_json) && existing && !emptyModel) continue
      setLayoutModel(tab.id, modelFromLayoutJson(tab.layout_json))
      bumpedTabIds.add(tab.id)
      layoutLogModel(
        'paneSystemStore.syncWorkspaceLayouts',
        'model loaded',
        getLayoutModel(tab.id),
        { tabId: tab.id },
        tab.id
      )
      if (saved !== tab.layout_json) setSavedLayoutJson(tab.id, tab.layout_json)
    }
    for (const [tabId, timer] of persistTimers) {
      if (workspaceTabIds.has(tabId)) continue
      clearTimeout(timer)
      persistTimers.delete(tabId)
    }
    for (const tabId of layoutModelTabIds()) {
      if (workspaceTabIds.has(tabId)) continue
      deleteLayoutModel(tabId)
      bumpedTabIds.add(tabId)
    }

    const current = get()
    let focusedPaneGroupTabSetByWorkspaceTab = current.focusedPaneGroupTabSetByWorkspaceTab
    for (const id of Object.keys(current.focusedPaneGroupTabSetByWorkspaceTab).map(Number)) {
      if (!workspaceTabIds.has(id)) {
        focusedPaneGroupTabSetByWorkspaceTab = {
          ...focusedPaneGroupTabSetByWorkspaceTab
        }
        delete focusedPaneGroupTabSetByWorkspaceTab[id]
      }
    }
    const nextLayoutRevisions =
      bumpedTabIds.size > 0 ? { ...current.layoutRevisions } : current.layoutRevisions
    for (const tabId of bumpedTabIds) {
      nextLayoutRevisions[tabId] = (nextLayoutRevisions[tabId] ?? 0) + 1
    }
    if (
      nextLayoutRevisions !== current.layoutRevisions ||
      focusedPaneGroupTabSetByWorkspaceTab !== current.focusedPaneGroupTabSetByWorkspaceTab
    ) {
      set({
        layoutRevisions: nextLayoutRevisions,
        focusedPaneGroupTabSetByWorkspaceTab
      })
    }
  },

  getModel(tabId) {
    return getLayoutModel(tabId)
  },

  persistLayout(tabId, model) {
    const json = JSON.stringify(model.toJson())
    setSavedLayoutJson(tabId, json)
    layoutLogModel(
      'paneSystemStore.persistLayout',
      'persist scheduled',
      model,
      { jsonLength: json.length },
      tabId
    )
    const previousTimer = persistTimers.get(tabId)
    if (previousTimer !== undefined) clearTimeout(previousTimer)
    const timer = setTimeout(() => {
      if (persistTimers.get(tabId) !== timer) return
      persistTimers.delete(tabId)
      layoutLog(
        'paneSystemStore.persistLayout',
        'persist flush',
        { tabId, jsonLength: json.length },
        tabId
      )
      if (!persistWorkspaceLayout) {
        console.error(new Error('Pane System layout persistence adapter is not configured'))
        return
      }
      persistWorkspaceLayout(tabId, json).catch(console.error)
    }, 250)
    persistTimers.set(tabId, timer)
  },

  setPendingRebalance(tabId, nodeId) {
    setLayoutPendingRebalance(tabId, nodeId)
  },

  takePendingRebalance(tabId) {
    return takeLayoutPendingRebalance(tabId)
  },

  markEnsureInflight(tabId) {
    return markLayoutEnsureInflight(tabId)
  },

  clearEnsureInflight(tabId) {
    clearLayoutEnsureInflight(tabId)
  },

  bumpLayoutRevision(tabId) {
    set({
      layoutRevisions: {
        ...get().layoutRevisions,
        [tabId]: (get().layoutRevisions[tabId] ?? 0) + 1
      }
    })
  },

  bumpPaneTabSelectionRevision(workspaceTabId, nodeId) {
    const key = `${workspaceTabId}:${nodeId}`
    set({
      paneTabSelectionRevisions: {
        ...get().paneTabSelectionRevisions,
        [key]: (get().paneTabSelectionRevisions[key] ?? 0) + 1
      }
    })
  },

  setFocusedPaneGroupTabSet(workspaceTabId, tabSetId) {
    if (get().focusedPaneGroupTabSetByWorkspaceTab[workspaceTabId] === tabSetId) return
    set({
      focusedPaneGroupTabSetByWorkspaceTab: {
        ...get().focusedPaneGroupTabSetByWorkspaceTab,
        [workspaceTabId]: tabSetId
      }
    })
  }
}))

function layoutJsonEquivalent(saved: string | undefined, incoming: string): boolean {
  if (saved === incoming) return true
  if (!saved) return false
  try {
    return JSON.stringify(JSON.parse(saved)) === JSON.stringify(JSON.parse(incoming))
  } catch {
    return saved === incoming
  }
}
