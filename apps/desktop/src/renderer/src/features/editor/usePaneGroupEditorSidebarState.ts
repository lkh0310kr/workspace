import { useEditorSidebarState, type EditorSidebarState } from '@workspace/editor'
import { paneTabStoreKey } from '../../store/paneTabKey'

export type { EditorSidebarState } from '@workspace/editor'

/** Supplies Desktop pane identity to the Editor-owned sidebar state. */
export function usePaneGroupEditorSidebarState(workspaceTabId: number, nodeId: string): EditorSidebarState {
  return useEditorSidebarState(paneTabStoreKey(workspaceTabId, nodeId))
}
