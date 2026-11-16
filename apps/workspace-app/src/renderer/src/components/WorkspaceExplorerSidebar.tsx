import { useCallback, useEffect, useRef, useState } from 'react'
import type { Model } from 'flexlayout-react'
import { TreeView } from './TreeView'
import { SearchPanel } from './SearchPanel'
import { onFindInFilesShortcut, onToggleExplorerShortcut } from '../electron'
import { deletePathInAllPanes, renamePathInAllPanes } from '../explorer/workspaceExplorerBridge'
import { paneTabStoreKey } from '../store/paneTabKey'
import type { PaneGroupExplorerChrome } from '../hooks/usePaneGroupExplorerChrome'
import { isExplorerToggleShortcut } from '../explorer/explorerShortcuts'
import { EditorTreeResizeHandle } from '@workspace/editor'

const TREE_MIN_WIDTH = 120
const TREE_MAX_WIDTH = 480

interface Props {
  workspaceTabId: number
  nodeId: string
  rootPath: string
  model: Model
  paneVisible: boolean
  explorerVisible: boolean
  isGroupFocused: boolean
  explorerCapable: boolean
  workspaceShortcutsEnabled: boolean
  setShortcutExplorerVisible: React.Dispatch<React.SetStateAction<boolean>>
  focusHostRef: React.RefObject<HTMLElement | null>
  selectedPath: string | null
  chrome: PaneGroupExplorerChrome
  onOpenFile: (
    path: string,
    kind: 'code' | 'markdown' | 'viewer',
    jumpToLine?: number,
    pin?: boolean
  ) => void
  onNotifyChanged: () => void
}

/** One per pane group — below the tab strip, floating over editor/viewer content.
 * Expand/collapse state is keyed by pane group (`explorerStateKey`), not by
 * the active file tab. */
export function WorkspaceExplorerSidebar({
  workspaceTabId,
  nodeId,
  rootPath,
  model,
  paneVisible,
  explorerVisible,
  isGroupFocused,
  explorerCapable,
  workspaceShortcutsEnabled,
  setShortcutExplorerVisible,
  focusHostRef,
  selectedPath,
  chrome,
  onOpenFile,
  onNotifyChanged
}: Props) {
  const { treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode } = chrome
  const explorerScrollRef = useRef<HTMLDivElement>(null)
  const [revealRevision, setRevealRevision] = useState(0)
  const [searchFocusRequest, setSearchFocusRequest] = useState(0)

  const openSearch = useCallback(() => {
    if (!workspaceShortcutsEnabled || !paneVisible || !isGroupFocused) return
    setSidebarMode('search')
    setTreeOpen(true)
    setSearchFocusRequest((request) => request + 1)
  }, [workspaceShortcutsEnabled, paneVisible, isGroupFocused, setSidebarMode, setTreeOpen])

  const toggleExplorer = useCallback(() => {
    if (!workspaceShortcutsEnabled || !paneVisible || !isGroupFocused) return
    setSidebarMode('explorer')
    if (explorerCapable) {
      setShortcutExplorerVisible(false)
      setTreeOpen((open) => !open)
      return
    }
    setShortcutExplorerVisible((visible) => !visible)
    setTreeOpen(true)
  }, [
    paneVisible,
    isGroupFocused,
    workspaceShortcutsEnabled,
    explorerCapable,
    setShortcutExplorerVisible,
    setSidebarMode,
    setTreeOpen
  ])

  // Pane shortcuts target the focused, visible group even when an embedded
  // editor surface owns DOM focus.
  useEffect(() => {
    const offMainShortcut = onFindInFilesShortcut(() => {
      openSearch()
    })
    const offExplorerToggle = onToggleExplorerShortcut(() => {
      toggleExplorer()
    })
    function onKeyDown(e: KeyboardEvent) {
      if (isExplorerToggleShortcut(e)) {
        if (!workspaceShortcutsEnabled || !paneVisible || !isGroupFocused) return
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleExplorer()
        return
      }
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
      if (e.key.toLowerCase() === 'e' && !e.altKey) {
        if (!paneVisible || !isGroupFocused || !explorerCapable) return
        e.preventDefault()
        e.stopImmediatePropagation()
        setSidebarMode('explorer')
        setTreeOpen(true)
        setRevealRevision((revision) => revision + 1)
        return
      }
      if (e.key.toLowerCase() !== 'f') return
      if (!workspaceShortcutsEnabled || !paneVisible) return
      if (!isGroupFocused) return
      e.preventDefault()
      openSearch()
    }
    // Match the app-wide shortcut routing: the pane shortcut must run before
    // CodeMirror or an embedded surface handles the focused key event.
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      offMainShortcut()
      offExplorerToggle()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [
    paneVisible,
    isGroupFocused,
    explorerCapable,
    workspaceShortcutsEnabled,
    openSearch,
    toggleExplorer
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

  const showExplorerPanel = treeOpen || sidebarMode === 'search'

  return (
    <>
      <div className="workspace-explorer-host">
        <div
          className="obsidian-explorer"
          style={{
            width: treeWidth,
            display: showExplorerPanel ? undefined : 'none'
          }}
        >
          <div
            className={
              sidebarMode === 'search' ? 'explorer-sidebar-panel' : 'explorer-sidebar-panel hidden'
            }
          >
            {sidebarMode === 'search' && (
              <SearchPanel
                tabId={workspaceTabId}
                focusRequest={searchFocusRequest}
                onJumpToResult={(path, kind, line) => onOpenFile(path, kind, line)}
                onClose={() => setSidebarMode('explorer')}
              />
            )}
          </div>
          <div
            className={
              sidebarMode === 'explorer'
                ? 'explorer-sidebar-panel'
                : 'explorer-sidebar-panel hidden'
            }
          >
            <TreeView
              tabId={workspaceTabId}
              rootPath={rootPath}
              explorerStateKey={paneTabStoreKey(workspaceTabId, nodeId)}
              scrollContainerRef={explorerScrollRef}
              paneHostRef={focusHostRef}
              selectedPath={selectedPath}
              revealRevision={revealRevision}
              paneVisible={paneVisible}
              explorerModeActive={explorerVisible && paneVisible && sidebarMode === 'explorer'}
              onOpenFile={(path, kind, pin) => onOpenFile(path, kind, undefined, pin)}
              onPathRenamed={onPathRenamed}
              onPathDeleted={onPathDeleted}
            />
          </div>
        </div>
      </div>
      {showExplorerPanel && (
        <EditorTreeResizeHandle
          width={treeWidth}
          minWidth={TREE_MIN_WIDTH}
          maxWidth={TREE_MAX_WIDTH}
          collapseBelow={TREE_MIN_WIDTH}
          onWidthChange={setTreeWidth}
          onCollapse={() => {
            setSidebarMode('explorer')
            setTreeOpen(false)
          }}
        />
      )}
    </>
  )
}
