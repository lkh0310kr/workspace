import { Actions, Model, TabSetNode } from 'flexlayout-react'
import { layoutLog, layoutLogMutation, summarizeLayoutModel } from './layoutDebugLog'
import { PaneGroupConfig, PaneTabItem, TabKind } from './paneTypes'
import { getPaneKind } from '../registry/paneKindRegistry'
import { usePaneSystemStore } from '../state/paneSystemStore'
import { findTabIdForModel } from './workspaceLayoutModels'
import { countLayoutTabs } from './layoutModelParse'
import { buildTabItem, bumpPaneGroupRender, getGroupConfig } from './layoutActionSupport'

/** Adds a new tab of `kind` to an existing pane's tab group and makes it
 * active — the "globalized" version of what EditorPane's own openNewTab
 * used to do only for editor files. */
export async function addTabToGroup(
  model: Model,
  tabNodeId: string,
  kind: TabKind,
  source?: Partial<PaneTabItem>
): Promise<string | null> {
  const before = summarizeLayoutModel(model)
  const config = getGroupConfig(model, tabNodeId)
  if (!config) {
    layoutLog('layoutActions.addTabToGroup', 'missing pane', { tabNodeId, kind }, undefined)
    return null
  }
  const workspaceTabId = findTabIdForModel(model)
  const item = await buildTabItem(kind, source, workspaceTabId)
  const next: PaneGroupConfig = { ...config, tabs: [...config.tabs, item], activeTabId: item.id }
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: next }))
  layoutLogMutation(
    'layoutActions.addTabToGroup',
    'added tab',
    before,
    summarizeLayoutModel(model),
    {
      tabNodeId,
      kind,
      itemId: item.id
    }
  )
  bumpPaneGroupRender(model)
  return item.id
}

export function setActiveTabInGroup(model: Model, tabNodeId: string, tabId: string): void {
  const config = getGroupConfig(model, tabNodeId)
  if (!config || config.activeTabId === tabId) return
  layoutLog('layoutActions.setActiveTabInGroup', 'active tab', {
    tabNodeId,
    tabId,
    from: config.activeTabId
  })
  model.doAction(
    Actions.updateNodeAttributes(tabNodeId, { config: { ...config, activeTabId: tabId } })
  )
  const workspaceTabId = findTabIdForModel(model)
  if (workspaceTabId !== undefined) {
    usePaneSystemStore.getState().bumpPaneTabSelectionRevision(workspaceTabId, tabNodeId)
  }
}

/** Updates one tab item in place (e.g. a browser page's title/url after
 * navigation, an editor tab's filePath once a new file gets saved). */
export function updateTabInGroup(
  model: Model,
  tabNodeId: string,
  tabId: string,
  patch: Partial<PaneTabItem>
): void {
  const config = getGroupConfig(model, tabNodeId)
  if (!config) return
  const tabs = config.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t))
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs } }))
}

/** Replaces one tab's kind in place (terminal ↔ browser ↔ editor, etc.).
 * Returns the new tab item's id, or null if the tab/node doesn't exist or
 * the kind is unchanged. */
export async function changeTabKindInGroup(
  model: Model,
  tabNodeId: string,
  tabId: string,
  kind: TabKind
): Promise<string | null> {
  const config = getGroupConfig(model, tabNodeId)
  if (!config) return null
  const idx = config.tabs.findIndex((t) => t.id === tabId)
  if (idx === -1) return null
  const existing = config.tabs[idx]
  if (existing.kind === kind) return tabId

  let source: Partial<PaneTabItem> | undefined
  if (kind === 'browser' && existing.kind === 'browser') {
    source = { url: existing.url }
  } else if (
    (kind === 'code' || kind === 'markdown') &&
    (existing.kind === 'code' || existing.kind === 'markdown')
  ) {
    source = { filePath: existing.filePath }
  }

  const workspaceTabId = findTabIdForModel(model)
  const item = await buildTabItem(kind, source, workspaceTabId)
  const tabs = [...config.tabs]
  tabs[idx] = item
  const activeTabId = config.activeTabId === tabId ? item.id : config.activeTabId
  model.doAction(
    Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs, activeTabId } })
  )
  bumpPaneGroupRender(model)
  return item.id
}

/** Replaces one tab's entire content in place (same array position — does
 * *not* move it to the end of the strip the way close+add would) — the
 * VSCode "preview tab" reuse case: clicking a different file in TreeView
 * while a clean (unedited) preview tab is open swaps that tab's content
 * instead of piling up a new one. Unlike changeTabKindInGroup, `source`
 * is the caller's, not derived from the old item — this is a full
 * replacement, not a same-file kind switch. Returns the new tab item's
 * id, or null if the tab/node doesn't exist. */
export async function replaceTabInGroup(
  model: Model,
  tabNodeId: string,
  oldTabId: string,
  kind: TabKind,
  source?: Partial<PaneTabItem>
): Promise<string | null> {
  const config = getGroupConfig(model, tabNodeId)
  if (!config) return null
  const idx = config.tabs.findIndex((t) => t.id === oldTabId)
  if (idx === -1) return null
  const workspaceTabId = findTabIdForModel(model)
  const item = await buildTabItem(kind, source, workspaceTabId)
  const tabs = [...config.tabs]
  tabs[idx] = item
  const activeTabId = config.activeTabId === oldTabId ? item.id : config.activeTabId
  model.doAction(
    Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs, activeTabId } })
  )
  bumpPaneGroupRender(model)
  return item.id
}
/** Closes the active tab in the focused flexlayout pane (last tab in a pane
 * removes the pane itself, except the sole workspace pane resets to terminal).
 * Returns whether anything was closed. */
export async function closeActivePaneTab(model: Model, focusedTabSetId?: string): Promise<boolean> {
  const tabset = resolveFocusedTabSet(model, focusedTabSetId)
  const tabNode = tabset?.getSelectedNode()
  if (!tabNode || tabNode.getType() !== 'tab') return false
  const config = getGroupConfig(model, tabNode.getId())
  if (!config) return false
  const activeId = config.activeTabId
  if (!activeId || !config.tabs.some((t) => t.id === activeId)) return false
  await closeTabInGroup(model, tabNode.getId(), activeId)
  const after = getGroupConfig(model, tabNode.getId())
  return !after?.tabs.some((item) => item.id === activeId)
}

function resolveFocusedTabSet(model: Model, focusedTabSetId?: string): TabSetNode | undefined {
  if (focusedTabSetId) {
    const node = model.getNodeById(focusedTabSetId)
    if (node?.getType() === 'tabset') return node as TabSetNode
  }
  return model.getActiveTabset()
}

/** Closes one tab within the group; closing the last tab removes the pane
 * itself when other panes remain, or resets the sole workspace pane to a
 * default terminal (matches a real browser: closing your only tab in the
 * last window resets to a fresh start page). Returns the tab that's now
 * active, or null if the whole pane was removed. */
export async function closeTabInGroup(
  model: Model,
  tabNodeId: string,
  tabId: string,
  options: { skipDirtyConfirm?: boolean } = {}
): Promise<string | null> {
  const before = summarizeLayoutModel(model)
  const config = getGroupConfig(model, tabNodeId)
  if (!config) {
    layoutLog('layoutActions.closeTabInGroup', 'missing pane', { tabNodeId, tabId })
    return null
  }
  const idx = config.tabs.findIndex((t) => t.id === tabId)
  if (idx === -1) return config.activeTabId
  const closing = config.tabs[idx]
  const paneKind = getPaneKind(closing.kind)
  if (paneKind.beforeCloseItem && !(await paneKind.beforeCloseItem(closing, options))) {
    return config.activeTabId
  }
  await paneKind.onItemRemoved?.(closing)
  const tabs = config.tabs.filter((t) => t.id !== tabId)
  if (tabs.length === 0) {
    if (countLayoutTabs(model) === 1) {
      const workspaceTabId = findTabIdForModel(model)
      const terminal = await buildTabItem('terminal', undefined, workspaceTabId)
      model.doAction(
        Actions.updateNodeAttributes(tabNodeId, {
          config: { tabs: [terminal], activeTabId: terminal.id }
        })
      )
      layoutLogMutation(
        'layoutActions.closeTabInGroup',
        'reset sole pane to default terminal',
        before,
        summarizeLayoutModel(model),
        { tabNodeId, tabId, nextTabId: terminal.id }
      )
      bumpPaneGroupRender(model)
      return terminal.id
    }
    model.doAction(Actions.deleteTab(tabNodeId))
    layoutLogMutation(
      'layoutActions.closeTabInGroup',
      'removed empty pane',
      before,
      summarizeLayoutModel(model),
      { tabNodeId, tabId }
    )
    bumpPaneGroupRender(model)
    return null
  }
  const activeTabId =
    config.activeTabId === tabId ? (tabs[idx] ?? tabs[idx - 1] ?? tabs[0]).id : config.activeTabId
  model.doAction(
    Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs, activeTabId } })
  )
  layoutLogMutation(
    'layoutActions.closeTabInGroup',
    'closed tab',
    before,
    summarizeLayoutModel(model),
    {
      tabNodeId,
      tabId,
      nextActiveTabId: activeTabId
    }
  )
  bumpPaneGroupRender(model)
  return activeTabId
}
