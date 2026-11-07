import { type Model, TabNode } from 'flexlayout-react'
import { closeTabInGroup, updateTabInGroup } from '../layout/layoutActions'
import type { PaneGroupConfig } from '../layout/paneTypes'

export function renamePathAcrossWorkspacePanes(
  model: Model,
  nodeId: string,
  from: string,
  to: string,
  onChanged: () => void
): void {
  const node = model.getNodeById(nodeId)
  if (!(node instanceof TabNode)) return
  const config = (node.getConfig() ?? { tabs: [], activeTabId: '' }) as PaneGroupConfig
  let changed = false
  for (const t of config.tabs) {
    if (!t.filePath) continue
    if (t.filePath === from) {
      updateTabInGroup(model, nodeId, t.id, { filePath: to })
      changed = true
    } else if (t.filePath.startsWith(`${from}/`)) {
      updateTabInGroup(model, nodeId, t.id, { filePath: to + t.filePath.slice(from.length) })
      changed = true
    }
  }
  if (changed) onChanged()
}

export function renamePathInAllPanes(
  model: Model,
  from: string,
  to: string,
  onChanged: () => void
): void {
  model.visitNodes((node) => {
    if (!(node instanceof TabNode)) return
    renamePathAcrossWorkspacePanes(model, node.getId(), from, to, onChanged)
  })
}

export function deletePathInAllPanes(model: Model, path: string, onChanged: () => void): void {
  model.visitNodes((node) => {
    if (!(node instanceof TabNode)) return
    const nodeId = node.getId()
    const config = (node.getConfig() ?? { tabs: [], activeTabId: '' }) as PaneGroupConfig
    for (const t of config.tabs) {
      if (t.filePath === path || t.filePath?.startsWith(`${path}/`)) {
        void closeTabInGroup(model, nodeId, t.id).then(() => onChanged())
      }
    }
  })
}
