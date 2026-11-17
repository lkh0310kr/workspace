import { Actions, DockLocation, Model, TabNode } from 'flexlayout-react'
import { layoutLog, layoutLogMutation, summarizeLayoutModel } from './layoutDebugLog'
import { PaneTabItem, TabKind } from './paneTypes'
import { resolveSplitPaneMutationStrategy } from './layoutSplitPolicy'
import { findTabIdForModel } from './workspaceLayoutModels'
import {
  buildTabItem,
  bumpPaneGroupRender,
  getGroupConfig,
  resolveTabSetId,
  tabGroupNodeJson
} from './layoutActionSupport'

/** Adds a new pane (flexlayout tab node) to `tabSetId` holding a single
 * fresh tab of `kind` — used for "split" and for auto-filling an emptied
 * tabset with a default editor new-tab. */
export async function addPaneToTabSet(
  model: Model,
  tabSetId: string,
  kind: TabKind,
  source?: Partial<PaneTabItem>
) {
  const before = summarizeLayoutModel(model)
  const workspaceTabId = findTabIdForModel(model)
  const item = await buildTabItem(kind, source, workspaceTabId)
  model.doAction(Actions.addTab(tabGroupNodeJson(item), tabSetId, DockLocation.CENTER, -1, true))
  layoutLogMutation(
    'layoutActions.addPaneToTabSet',
    'added pane',
    before,
    summarizeLayoutModel(model),
    {
      tabSetId,
      kind,
      itemId: item.id
    }
  )
  bumpPaneGroupRender(model)
}
/**
 * Moves a tab to `targetIndex` within `targetTabNodeId`'s tab group —
 * either reordering within the same pane (sourceTabNodeId ===
 * targetTabNodeId) or merging into a different pane's tab strip.
 * Synchronous (no spawning/async — the tab's terminal/webview already
 * exists, this only changes which pane node's config references it), so
 * PaneTabStrip.tsx can call it straight from a native `drop` handler.
 * Moving a pane's only tab elsewhere removes that now-empty pane (same as
 * closing it). Returns the moved tab's id, or null if either node/tab
 * doesn't exist.
 */
export function moveTabToGroup(
  model: Model,
  sourceTabNodeId: string,
  tabId: string,
  targetTabNodeId: string,
  targetIndex: number
): string | null {
  const before = summarizeLayoutModel(model)
  const sourceConfig = getGroupConfig(model, sourceTabNodeId)
  if (!sourceConfig) {
    layoutLog('layoutActions.moveTabToGroup', 'missing source pane', {
      sourceTabNodeId,
      tabId,
      targetTabNodeId
    })
    return null
  }
  const item = sourceConfig.tabs.find((t) => t.id === tabId)
  if (!item) {
    layoutLog('layoutActions.moveTabToGroup', 'missing tab', {
      sourceTabNodeId,
      tabId,
      targetTabNodeId
    })
    return null
  }

  if (sourceTabNodeId === targetTabNodeId) {
    const withoutItem = sourceConfig.tabs.filter((t) => t.id !== tabId)
    const clamped = Math.max(0, Math.min(targetIndex, withoutItem.length))
    const tabs = [...withoutItem.slice(0, clamped), item, ...withoutItem.slice(clamped)]
    model.doAction(
      Actions.updateNodeAttributes(sourceTabNodeId, { config: { ...sourceConfig, tabs } })
    )
    layoutLogMutation(
      'layoutActions.moveTabToGroup',
      'reordered tab',
      before,
      summarizeLayoutModel(model),
      {
        sourceTabNodeId,
        tabId,
        targetIndex: clamped
      }
    )
    bumpPaneGroupRender(model)
    return item.id
  }

  const targetConfig = getGroupConfig(model, targetTabNodeId)
  if (!targetConfig) {
    layoutLog('layoutActions.moveTabToGroup', 'missing target pane', {
      sourceTabNodeId,
      tabId,
      targetTabNodeId
    })
    return null
  }

  const remainingSource = sourceConfig.tabs.filter((t) => t.id !== tabId)
  if (remainingSource.length === 0) {
    model.doAction(Actions.deleteTab(sourceTabNodeId))
  } else {
    const activeTabId =
      sourceConfig.activeTabId === tabId ? remainingSource[0].id : sourceConfig.activeTabId
    model.doAction(
      Actions.updateNodeAttributes(sourceTabNodeId, {
        config: { ...sourceConfig, tabs: remainingSource, activeTabId }
      })
    )
  }

  const clamped = Math.max(0, Math.min(targetIndex, targetConfig.tabs.length))
  const tabs = [...targetConfig.tabs.slice(0, clamped), item, ...targetConfig.tabs.slice(clamped)]
  model.doAction(
    Actions.updateNodeAttributes(targetTabNodeId, {
      config: { ...targetConfig, tabs, activeTabId: item.id }
    })
  )
  layoutLogMutation(
    'layoutActions.moveTabToGroup',
    'moved tab',
    before,
    summarizeLayoutModel(model),
    {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      targetIndex,
      merged: sourceTabNodeId !== targetTabNodeId,
      sourceDeleted: remainingSource.length === 0
    }
  )
  bumpPaneGroupRender(model)
  return item.id
}

/**
 * Dragging a tab and dropping it somewhere that ISN'T over any pane's tab
 * strip (no line-hint target) means "put this in a new layout position"
 * instead of reordering/merging — matches a real browser/VSCode: drop on
 * another tab strip to join it, drop elsewhere and it becomes its own
 * pane. Splits a new sibling pane off the source tabset (to its right) and
 * moves the tab into it. A pane's only tab has nowhere new to go (it's
 * already its own pane) — no-op, returns false.
 */
export function moveTabToNewPane(
  model: Model,
  sourceTabNodeId: string,
  tabId: string
): { tabNodeId: string; tabItemId: string } | null {
  const sourceNode = model.getNodeById(sourceTabNodeId)
  if (!(sourceNode instanceof TabNode)) return null
  return moveTabToSplitPane(model, sourceTabNodeId, tabId, sourceTabNodeId, DockLocation.RIGHT)
}

/** Removes a tab from its pane and docks a fresh single-tab pane relative
 * to `targetTabNodeId` (VS Code-style edge splits). Returns the new pane's
 * flexlayout node id and tab item id. */
export function moveTabToSplitPane(
  model: Model,
  sourceTabNodeId: string,
  tabId: string,
  targetTabNodeId: string,
  location: DockLocation
): { tabNodeId: string; tabItemId: string } | null {
  const before = summarizeLayoutModel(model)
  const config = getGroupConfig(model, sourceTabNodeId)
  if (!config) {
    layoutLog('layoutActions.moveTabToSplitPane', 'missing source pane', {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName()
    })
    return null
  }
  const item = config.tabs.find((t) => t.id === tabId)
  if (!item) {
    layoutLog('layoutActions.moveTabToSplitPane', 'missing tab', {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName()
    })
    return null
  }
  const targetNode = model.getNodeById(targetTabNodeId)
  if (!(targetNode instanceof TabNode)) {
    layoutLog('layoutActions.moveTabToSplitPane', 'invalid target node', {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName(),
      targetType: targetNode?.getType()
    })
    return null
  }

  const remaining = config.tabs.filter((t) => t.id !== tabId)
  const nodeJson = tabGroupNodeJson(item)
  const samePane = sourceTabNodeId === targetTabNodeId
  const emptySource = remaining.length === 0
  const tabSetId = resolveTabSetId(model, targetTabNodeId)
  if (!tabSetId) {
    layoutLog('layoutActions.moveTabToSplitPane', 'no tabset for target', {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName()
    })
    return null
  }

  const removeFromSource = () => {
    if (emptySource) {
      model.doAction(Actions.deleteTab(sourceTabNodeId))
    } else {
      const activeTabId = config.activeTabId === tabId ? remaining[0].id : config.activeTabId
      model.doAction(
        Actions.updateNodeAttributes(sourceTabNodeId, {
          config: { ...config, tabs: remaining, activeTabId }
        })
      )
    }
  }

  // Same-pane splits must add the new tabset before mutating/deleting the
  // source tab node so flexlayout still has a valid anchor tabset.
  const strategy = resolveSplitPaneMutationStrategy(samePane, emptySource)

  if (samePane) {
    model.doAction(Actions.addTab(nodeJson, tabSetId, location, -1, true))
    removeFromSource()
  } else {
    removeFromSource()
    model.doAction(Actions.addTab(nodeJson, tabSetId, location, -1, true))
  }

  layoutLogMutation(
    'layoutActions.moveTabToSplitPane',
    'split tab',
    before,
    summarizeLayoutModel(model),
    {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      tabSetId,
      location: location.getName(),
      newPaneId: nodeJson.id,
      samePane,
      emptySource,
      strategy,
      tabKind: item.kind
    }
  )
  bumpPaneGroupRender(model)
  return { tabNodeId: nodeJson.id, tabItemId: item.id }
}
