import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Model } from 'flexlayout-react'
import { TreeView } from './TreeView'
import { SearchPanel } from './SearchPanel'
import { onFindInFilesShortcut } from '../electron'
import { deletePathInAllPanes, renamePathInAllPanes } from '../explorer/workspaceExplorerBridge'
import { paneTabStoreKey } from '../store/paneTabKey'
import type { PaneGroupExplorerChrome } from '../hooks/usePaneGroupExplorerChrome'

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
  focusHostRef,
  selectedPath,
  chrome,
  onOpenFile,
  onNotifyChanged
}: Props) {
  const { treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode } = chrome
  const explorerScrollRef = useRef<HTMLDivElement>(null)
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [revealRevision, setRevealRevision] = useState(0)
  const [searchFocusRequest, setSearchFocusRequest] = useState(0)

  const openSearch = useCallback(() => {
    if (!paneVisible || !isGroupFocused || !explorerCapable) return
    setSidebarMode('search')
    setTreeOpen(true)
    setSearchFocusRequest((request) => request + 1)
  }, [paneVisible, isGroupFocused, explorerCapable, setSidebarMode, setTreeOpen])

  // Pane shortcuts target the focused, visible group even when an embedded
  // editor surface owns DOM focus.
  useEffect(() => {
    const offMainShortcut = onFindInFilesShortcut(() => {
      openSearch()
    })
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === '\\') {
        if (!paneVisible || !isGroupFocused || !explorerCapable) return
        e.preventDefault()
        e.stopImmediatePropagation()
        setSidebarMode('explorer')
        setTreeOpen((open) => !open)
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
      if (!paneVisible) return
      if (!isGroupFocused || !explorerCapable) return
      e.preventDefault()
      openSearch()
    }
    // Match the app-wide shortcut routing: the pane shortcut must run before
    // CodeMirror or an embedded surface handles the focused key event.
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      offMainShortcut()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [paneVisible, isGroupFocused, explorerCapable, openSearch, setSidebarMode, setTreeOpen])

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

  const onTreeResizeMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault()
    treeResizeRef.current = { startX: e.clientX, startWidth: treeWidth }
    const onMouseMove = (ev: MouseEvent) => {
      const drag = treeResizeRef.current
      if (!drag) return
      const next = drag.startWidth + (ev.clientX - drag.startX)
      if (next < TREE_MIN_WIDTH) {
        setSidebarMode('explorer')
        setTreeOpen(false)
        return
      }
      setTreeWidth(Math.min(TREE_MAX_WIDTH, next))
    }
    const onMouseUp = () => {
      treeResizeRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const showExplorerPanel = treeOpen || sidebarMode === 'search'

  return (
    <>
      <div className="workspace-explorer-host">
        <div
          ref={explorerScrollRef}
          className="scroll-region obsidian-explorer"
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
        <div className="obsidian-explorer-resizer" onMouseDown={onTreeResizeMouseDown} />
      )}
    </>
  )
}
