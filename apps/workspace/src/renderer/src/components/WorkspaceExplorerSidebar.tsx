import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import type { Model } from 'flexlayout-react'
import { TreeView } from './TreeView'
import { SearchPanel } from './SearchPanel'
import {
  exportGodotWeb,
  getEngineBundleUrl,
  launchWorldEngine,
  registerProjectApp
} from '../electron'
import { logError } from '../errorLog'
import { addTabToGroup } from '../layout/layoutActions'
import { useWorkspaceStore } from '../store/workspaceStore'
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

/** One per pane group — below the tab strip, beside editor/viewer content.
 * Expand/collapse state is keyed by pane group (`explorerStateKey`), not by
 * the active file tab. */
export function WorkspaceExplorerSidebar({
  workspaceTabId,
  nodeId,
  rootPath,
  model,
  paneVisible,
  focusHostRef,
  selectedPath,
  chrome,
  onOpenFile,
  onNotifyChanged
}: Props) {
  const { treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode } = chrome
  const explorerScrollRef = useRef<HTMLDivElement>(null)
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Cmd/Ctrl+Shift+F — only this pane group's search when the group has
  // focus (mounted only for explorer-capable groups, so no extra gating
  // needed beyond focus/visibility).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
      if (e.key.toLowerCase() !== 'f') return
      if (!paneVisible) return
      if (!focusHostRef.current?.contains(document.activeElement)) return
      e.preventDefault()
      setSidebarMode('search')
      setTreeOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paneVisible, setSidebarMode, setTreeOpen, focusHostRef])

  const openEngineBundleTab = useCallback(
    (path: string) => {
      getEngineBundleUrl(workspaceTabId, path)
        .then((result) => {
          if (!result.ok) {
            logError(`Open as App failed for "${path}": ${result.error ?? 'unknown error'}`)
            return
          }
          return addTabToGroup(model, nodeId, 'browser', { url: result.url }).then((id) => {
            if (id) useWorkspaceStore.getState().setActivePaneTab(workspaceTabId, nodeId, id)
            onNotifyChanged()
          })
        })
        .catch((err) => logError(`Open as App failed for "${path}"`, err?.stack))
      const title = path.split('/').pop() || path
      registerProjectApp(workspaceTabId, 'engine-bundle', path, title).catch(console.error)
    },
    [workspaceTabId, model, nodeId, onNotifyChanged]
  )

  const onTreeExportGodotWeb = useCallback(
    (path: string) => {
      exportGodotWeb(workspaceTabId, path)
        .then((result) => {
          if (result.ok && result.outputRel) {
            openEngineBundleTab(result.outputRel)
          } else {
            logError(`Godot Web export failed for "${path}": ${result.error ?? 'unknown error'}`)
          }
        })
        .catch((err) => logError(`Godot Web export failed for "${path}"`, err?.stack))
    },
    [workspaceTabId, openEngineBundleTab]
  )

  const onTreeOpenWorldEngineProject = useCallback(
    (path: string) => {
      launchWorldEngine(workspaceTabId, path)
        .then((result) => {
          if (!result.ok) {
            logError(`World Engine launch failed for "${path}": ${result.error ?? 'unknown error'}`)
          }
        })
        .catch((err) => logError(`World Engine launch failed for "${path}"`, err?.stack))
    },
    [workspaceTabId]
  )

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
      setTreeWidth(Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, next)))
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
            <SearchPanel
              tabId={workspaceTabId}
              onJumpToResult={(path, kind, line) => onOpenFile(path, kind, line)}
              onClose={() => setSidebarMode('explorer')}
            />
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
              paneVisible={paneVisible}
              explorerModeActive={sidebarMode === 'explorer'}
              onOpenFile={(path, kind, pin) => onOpenFile(path, kind, undefined, pin)}
              onPathRenamed={onPathRenamed}
              onPathDeleted={onPathDeleted}
              onOpenAsApp={openEngineBundleTab}
              onExportGodotWeb={onTreeExportGodotWeb}
              onOpenWorldEngineProject={onTreeOpenWorldEngineProject}
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
