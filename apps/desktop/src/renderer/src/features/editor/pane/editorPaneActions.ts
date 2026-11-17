import { TabNode, type Model } from 'flexlayout-react'
import type { PaneTabItem } from '../../pane-system/layout/paneTypes'
import { readPaneGroupConfig } from '../../pane-system/layout/layoutSession'
import {
  addTabToGroup,
  replaceTabInGroup,
  setActiveTabInGroup,
  updateTabInGroup
} from '../../pane-system/layout/layoutActions'
import { findReplaceableEditorTab } from './editorPaneTabSlots'

export type EditorFileKind = 'code' | 'markdown' | 'viewer'

export type EditorFileOpenContext = {
  model: Model
  nodeId: string
  tabs: PaneTabItem[]
  path: string
  kind: EditorFileKind
  jumpToLine?: number
  pin?: boolean
  isDirty: (tabId: string) => boolean
  onJumpToLine: (tabId: string, line: number) => void
  selectTab: (tabId: string) => void
  onNotifyChanged: () => void
}

/** Opens a file in the Editor's pane, reusing a clean preview or empty tab. */
export async function openEditorFileInPaneGroup(
  model: Model,
  nodeId: string,
  path: string,
  kind: EditorFileKind,
  options: {
    jumpToLine?: number
    pin?: boolean
    isDirty?: (tabId: string) => boolean
    onJumpToLine?: (tabId: string, line: number) => void
  } = {}
): Promise<string | null> {
  const node = model.getNodeById(nodeId)
  if (!(node instanceof TabNode)) return null
  const config = readPaneGroupConfig(node)
  const isDirty = options.isDirty ?? (() => false)
  const existing = config.tabs.find((tab) => tab.filePath === path)
  if (existing) {
    if (options.pin && existing.isPreview) {
      updateTabInGroup(model, nodeId, existing.id, { isPreview: false })
    }
    if (options.jumpToLine != null) options.onJumpToLine?.(existing.id, options.jumpToLine)
    return existing.id
  }

  const replaceable = options.pin
    ? undefined
    : findReplaceableEditorTab(config.tabs, config.activeTabId, isDirty)
  const id = replaceable
    ? await replaceTabInGroup(model, nodeId, replaceable.id, kind, { filePath: path })
    : await addTabToGroup(model, nodeId, kind, { filePath: path })
  if (!id) return null
  if (!options.pin) updateTabInGroup(model, nodeId, id, { isPreview: true })
  if (options.jumpToLine != null) options.onJumpToLine?.(id, options.jumpToLine)
  return id
}

export async function openEditorFileInGroup(context: EditorFileOpenContext): Promise<void> {
  const existing = context.tabs.find((tab) => tab.filePath === context.path)
  if (existing) {
    context.selectTab(existing.id)
    if (context.pin && existing.isPreview) {
      updateTabInGroup(context.model, context.nodeId, existing.id, { isPreview: false })
      context.onNotifyChanged()
    }
    if (context.jumpToLine != null) {
      context.onJumpToLine(existing.id, context.jumpToLine)
    }
    return
  }

  const id = await openEditorFileInPaneGroup(
    context.model,
    context.nodeId,
    context.path,
    context.kind,
    {
      pin: context.pin,
      jumpToLine: context.jumpToLine,
      isDirty: context.isDirty,
      onJumpToLine: context.onJumpToLine
    }
  )
  if (!id) return
  setActiveTabInGroup(context.model, context.nodeId, id)
  context.onNotifyChanged()
}
