import { useCallback, useEffect, useRef, useState } from 'react'
import type { Model } from 'flexlayout-react'
import { TreeView } from './TreeView'
import { SearchPanel } from './SearchPanel'
import { onFindInFilesShortcut, onToggleEditorTreeShortcut } from '../../electron'
import { deletePathInAllPanes, renamePathInAllPanes } from './runtime/editorFilePaneBridge'
import { paneTabStoreKey } from './paneTabKey'
import type { EditorSidebarState } from '@workspace/editor'
import { isEditorSidebarToggleShortcut } from '@workspace/editor'
import { EditorTreeResizeHandle } from '@workspace/editor'

const TREE_MIN_WIDTH = 120
const TREE_MAX_WIDTH = 480

interface Props {
  workspaceTabId: number
  nodeId: string
  rootPath: string
  model: Model
  paneVisible: boolean
  editorSidebarVisible: boolean
  isGroupFocused: boolean
  supportsEditorTree: boolean
  focusHostRef: React.RefObject<HTMLElement | null>
  selectedPath: string | null
  chrome: EditorSidebarState
  onOpenFile: (
    path: string,
    kind: 'code' | 'markdown' | 'viewer',
    jumpToLine?: number,
    pin?: boolean
  ) => void
  onNotifyChanged: () => void
}

/** One per pane group — below the tab strip, floating over editor/viewer content.
 * Expand/collapse state is keyed by pane group (`editorTreeStateKey`), not by
 * the active file tab. */
export function EditorSidebar({
  workspaceTabId,
  nodeId,
  rootPath,
  model,
  paneVisible,
  editorSidebarVisible,
  isGroupFocused,
  supportsEditorTree,
  focusHostRef,
  selectedPath,
  chrome,
  onOpenFile,
  onNotifyChanged
}: Props) {
  const { treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode } = chrome
  const editorTreeScrollRef = useRef<HTMLDivElement>(null)
  const [revealRevision, setRevealRevision] = useState(0)
  const [searchFocusRequest, setSearchFocusRequest] = useState(0)

  const openSearch = useCallback(() => {
    if (!supportsEditorTree || !paneVisible || !isGroupFocused) return
    setSidebarMode('search')
    setTreeOpen(true)
    setSearchFocusRequest((request) => request + 1)
  }, [supportsEditorTree, paneVisible, isGroupFocused, setSidebarMode, setTreeOpen])

  const toggleEditorTree = useCallback(() => {
    if (!supportsEditorTree || !paneVisible || !isGroupFocused) return
    setSidebarMode('tree')
    setTreeOpen((open) => !open)
  }, [
    paneVisible,
    isGroupFocused,
    supportsEditorTree,
    setSidebarMode,
    setTreeOpen
  ])

  // Pane shortcuts target the focused, visible group even when an embedded
  // editor surface owns DOM focus.
  useEffect(() => {
    const offMainShortcut = onFindInFilesShortcut(() => {
      openSearch()
    })
    const offEditorTreeToggle = onToggleEditorTreeShortcut(() => {
      toggleEditorTree()
    })
    function onKeyDown(e: KeyboardEvent) {
      if (isEditorSidebarToggleShortcut(e)) {
        if (!supportsEditorTree || !paneVisible || !isGroupFocused) return
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleEditorTree()
        return
      }
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
      if (e.key.toLowerCase() === 'e' && !e.altKey) {
        if (!paneVisible || !isGroupFocused || !supportsEditorTree) return
        e.preventDefault()
        e.stopImmediatePropagation()
        setSidebarMode('tree')
        setTreeOpen(true)
        setRevealRevision((revision) => revision + 1)
        return
      }
      if (e.key.toLowerCase() !== 'f') return
      if (!supportsEditorTree || !paneVisible) return
      if (!isGroupFocused) return
      e.preventDefault()
      openSearch()
    }
    // Match the app-wide shortcut routing: the pane shortcut must run before
    // CodeMirror or an embedded surface handles the focused key event.
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      offMainShortcut()
      offEditorTreeToggle()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [
    paneVisible,
    isGroupFocused,
    supportsEditorTree,
    openSearch,
    toggleEditorTree
  ])

  const onPathRenamed = useCallback(
    (from: string, to: string) => {
      renamePathInAllPanes(model, from, to, onNotifyChanged)
    },
    [model, onNotifyChanged]
  )

  const onPathDeleted = useCallback(
    (path: string) => {
      deletePathInAllPanes(model, path, onNotifyChanged)
    },
    [model, onNotifyChanged]
  )

  const showEditorSidebarPanel = treeOpen || sidebarMode === 'search'

  return (
    <>
      <div className="editor-sidebar-host">
        <div
          className="editor-file-tree"
          style={{
            width: treeWidth,
            display: showEditorSidebarPanel ? undefined : 'none'
          }}
        >
          <div
            className={
              sidebarMode === 'search' ? 'editor-sidebar-panel' : 'editor-sidebar-panel hidden'
            }
          >
            {sidebarMode === 'search' && (
              <SearchPanel
                tabId={workspaceTabId}
                rootPath={rootPath}
                focusRequest={searchFocusRequest}
                onJumpToResult={(path, kind, line) => onOpenFile(path, kind, line)}
                onClose={() => setSidebarMode('tree')}
              />
            )}
          </div>
          <div
            className={
              sidebarMode === 'tree'
                ? 'editor-sidebar-panel'
                : 'editor-sidebar-panel hidden'
            }
          >
            <TreeView
              tabId={workspaceTabId}
              rootPath={rootPath}
              editorTreeStateKey={paneTabStoreKey(workspaceTabId, nodeId)}
              scrollContainerRef={editorTreeScrollRef}
              paneHostRef={focusHostRef}
              selectedPath={selectedPath}
              revealRevision={revealRevision}
              paneVisible={paneVisible}
              editorTreeActive={editorSidebarVisible && paneVisible && sidebarMode === 'tree'}
              onOpenFile={(path, kind, pin) => onOpenFile(path, kind, undefined, pin)}
              onPathRenamed={onPathRenamed}
              onPathDeleted={onPathDeleted}
            />
          </div>
        </div>
      </div>
      {showEditorSidebarPanel && (
        <EditorTreeResizeHandle
          width={treeWidth}
          minWidth={TREE_MIN_WIDTH}
          maxWidth={TREE_MAX_WIDTH}
          collapseBelow={TREE_MIN_WIDTH}
          onWidthChange={setTreeWidth}
          onCollapse={() => {
            setSidebarMode('tree')
            setTreeOpen(false)
          }}
        />
      )}
    </>
  )
}
