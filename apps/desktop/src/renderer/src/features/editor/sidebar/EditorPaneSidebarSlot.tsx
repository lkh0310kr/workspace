import { useLayoutEffect } from 'react'
import type { PaneSidebarRenderContext } from '../../pane-system/paneKindRegistry'
import { EditorSidebar } from './EditorSidebar'
import { usePaneGroupEditorSidebarState } from './usePaneGroupEditorSidebarState'

export function EditorPaneSidebarSlot({
  workspaceTabId,
  nodeId,
  rootPath,
  model,
  paneVisible,
  isGroupFocused,
  bodyFits,
  focusHostRef,
  selectedPath,
  onOpenFile,
  onNotifyChanged,
  onVisibilityChange
}: PaneSidebarRenderContext) {
  const chrome = usePaneGroupEditorSidebarState(workspaceTabId, nodeId)
  const visible = chrome.treeOpen && bodyFits

  useLayoutEffect(() => {
    onVisibilityChange(visible)
    return () => onVisibilityChange(false)
  }, [onVisibilityChange, visible])

  return (
    <div className="editor-sidebar-slot" style={{ display: visible ? undefined : 'none' }}>
      <EditorSidebar
        workspaceTabId={workspaceTabId}
        nodeId={nodeId}
        rootPath={rootPath}
        model={model}
        paneVisible={paneVisible}
        editorSidebarVisible={visible}
        isGroupFocused={isGroupFocused}
        supportsEditorTree
        focusHostRef={focusHostRef}
        selectedPath={selectedPath}
        chrome={chrome}
        onOpenFile={onOpenFile}
        onNotifyChanged={onNotifyChanged}
      />
    </div>
  )
}
