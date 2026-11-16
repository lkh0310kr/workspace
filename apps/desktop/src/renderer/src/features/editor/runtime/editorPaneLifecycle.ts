import {
  clearEditorDocumentDirty,
  confirmEditorDocumentCloseById,
  discardEditorDocumentViewState
} from '@workspace/editor'
import type { PaneTabItem } from '../../pane-system/layout/paneTypes'

export function confirmEditorPaneItemClose(
  item: PaneTabItem,
  options: { skipDirtyConfirm?: boolean }
): boolean {
  if (options.skipDirtyConfirm) return true
  return confirmEditorDocumentCloseById(item.id, (message) => window.confirm(message))
}

export function releaseEditorPaneItem(item: PaneTabItem): void {
  discardEditorDocumentViewState(item.id)
  clearEditorDocumentDirty(item.id)
}
