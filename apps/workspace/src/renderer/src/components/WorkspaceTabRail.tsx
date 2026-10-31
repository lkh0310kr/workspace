import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react'
import type { Model } from 'flexlayout-react'
import { TabInfo, addTab, closeTab, onShortcutModifierReleased, renameTab, reorderTabs } from '../electron'
import { dismissWorkspacePortals } from '../workspacePortalDismiss'
import { switchToHome, switchToWorkspaceTab } from '../workspaceNavigation'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { WorkspaceTabStatusIndicator } from './WorkspaceTabStatusIndicator'
import { computeWorkspaceTabActivityStatus } from '../hooks/useWorkspaceTabActivityStatus'
import { useAgentStatusStore } from '../store/agentStatusStore'
import { useRuntimeTerminalTitlesStore } from '../store/runtimeTerminalTitlesStore'
import { WorkbenchIcon } from './WorkbenchIcon'

interface Props {
  tabs: TabInfo[]
  activeTabId: number
  homeActive: boolean
  onOpenSettings: (tabId: number, anchorRect: DOMRect) => void
  getModel: (tabId: number) => Model | undefined
  layoutRevisions: Record<number, number>
}

// Always-visible strip, same shape/placement idiom as PaneTabStrip — no
// toggle button, no popover. Selecting a workspace works exactly like
// selecting any other tab.
export function WorkspaceTabRail({
  tabs,
  activeTabId,
  homeActive,
  onOpenSettings,
  getModel,
  layoutRevisions,
}: Props) {
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renamingWidth, setRenamingWidth] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [contextMenu, setContextMenu] = useState<{ tabId: number; x: number; y: number } | null>(
    null
  )
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [showTabNumbers, setShowTabNumbers] = useState(false)
  const draggedIdRef = useRef<number | null>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId !== null) inputRef.current?.select()
  }, [renamingId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control' || event.metaKey || event.ctrlKey) {
        setShowTabNumbers(true)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.key === 'Meta' ||
        event.key === 'Control' ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        setShowTabNumbers(false)
      }
    }
    const clearOnBlur = () => setShowTabNumbers(false)
    const unsubscribeModifierRelease = onShortcutModifierReleased(clearOnBlur)

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', clearOnBlur)
    document.addEventListener('visibilitychange', clearOnBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', clearOnBlur)
      document.removeEventListener('visibilitychange', clearOnBlur)
      unsubscribeModifierRelease()
    }
  }, [])

  const startRename = useCallback((tab: TabInfo) => {
    setRenamingWidth(rowRefs.current.get(tab.id)?.getBoundingClientRect().width ?? null)
    setRenamingId(tab.id)
    setDraft(tab.title)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId === null) return
    const id = renamingId
    setRenamingId(null)
    setRenamingWidth(null)
    const trimmed = draft.trim()
    const original = tabs.find((t) => t.id === id)?.title
    if (!trimmed || trimmed === original) return
    renameTab(id, trimmed).catch(console.error)
  }, [renamingId, draft, tabs])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          type: 'button',
          label: 'Rename',
          onClick: () => {
            const tab = tabs.find((t) => t.id === contextMenu.tabId)
            if (tab) startRename(tab)
          }
        },
        {
          type: 'button',
          label: 'Settings…',
          onClick: () => {
            const row = rowRefs.current.get(contextMenu.tabId)
            if (row) onOpenSettings(contextMenu.tabId, row.getBoundingClientRect())
          }
        },
        { type: 'separator' },
        {
          type: 'button',
          label: 'Close Tab',
          disabled: tabs.length <= 1,
          onClick: () => {
            dismissWorkspacePortals()
            closeTab(contextMenu.tabId).catch(console.error)
          }
        }
      ]
    : []

  const computeDropIndex = useCallback(
    (clientX: number, draggedId: number): number => {
      let index = 0
      for (const tab of tabs) {
        if (tab.id === draggedId) continue
        const rect = rowRefs.current.get(tab.id)?.getBoundingClientRect()
        if (!rect) continue
        if (clientX >= rect.left + rect.width / 2) index++
        else break
      }
      return index
    },
    [tabs]
  )

  const agentEpoch = useAgentStatusStore((s) => s.agentStatusEpoch)
  const titlesRevision = useRuntimeTerminalTitlesStore((s) => s.revision)
  const tabStatusById = useMemo(() => {
    const out = new Map<number, ReturnType<typeof computeWorkspaceTabActivityStatus>>()
    for (const tab of tabs) {
      out.set(tab.id, computeWorkspaceTabActivityStatus(tab.id, getModel))
    }
    return out
  }, [tabs, getModel, layoutRevisions, agentEpoch, titlesRevision])

  const handleDrop = () => {
    const draggedId = draggedIdRef.current
    setDropIndex(null)
    if (draggedId === null || dropIndex === null) return
    const withoutDragged = tabs.filter((t) => t.id !== draggedId)
    const insertAt =
      tabs.findIndex((t) => t.id === draggedId) < dropIndex ? dropIndex - 1 : dropIndex
    withoutDragged.splice(
      insertAt,
      0,
      tabs.find((t) => t.id === draggedId)!
    )
    const orderedIds = withoutDragged.map((t) => t.id)
    reorderTabs(orderedIds).catch(console.error)
  }

  return (
    <div className="workspace-tab-rail">
      <button type="button" className={`workspace-tab-rail-home${homeActive ? ' active' : ''}`} title="Home (⌘ + `)" onClick={() => switchToHome()}>
        <WorkbenchIcon name="home" size={14} />
      </button>
      <div className="workspace-tab-rail-divider" aria-hidden="true" />
      <div className="workspace-tab-rail-tabs">
        {tabs.map((tab, index) => {
          const tabStatus = tabStatusById.get(tab.id)
          return (
          <div key={tab.id} className="workspace-tab-rail-slot">
            {dropIndex === index && <div className="workspace-tab-rail-drop-indicator" />}
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(tab.id, el)
                else rowRefs.current.delete(tab.id)
              }}
              className={`workspace-tab-rail-row ${!homeActive && tab.id === activeTabId ? 'active' : ''}`}
              style={renamingId === tab.id && renamingWidth !== null ? { width: renamingWidth } : undefined}
              draggable={renamingId !== tab.id}
              onPointerDown={(e) => {
                if (e.button !== 0 || renamingId === tab.id) return
                if ((e.target as HTMLElement).closest('.workspace-tab-rail-close')) return
                void switchToWorkspaceTab(tab.id)
              }}
              onClick={(e) => {
                if (e.detail !== 0 || renamingId === tab.id) return
                void switchToWorkspaceTab(tab.id)
              }}
              onDragStart={(e: DragEvent) => {
                draggedIdRef.current = tab.id
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(tab.id))
              }}
              onDragOver={(e: DragEvent) => {
                if (draggedIdRef.current === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropIndex(computeDropIndex(e.clientX, draggedIdRef.current))
              }}
              onDragEnd={() => {
                draggedIdRef.current = null
                setDropIndex(null)
              }}
              onDrop={(e: DragEvent) => {
                e.preventDefault()
                handleDrop()
              }}
              onContextMenu={(e: MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
              }}
            >
              {renamingId === tab.id ? (
                <input
                  ref={inputRef}
                  className="workspace-tab-rail-title-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      inputRef.current?.blur()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setRenamingId(null)
                      setRenamingWidth(null)
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="workspace-tab-rail-title"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startRename(tab)
                  }}
                  title={tab.root_path}
                >
                  {tabStatus ? <WorkspaceTabStatusIndicator status={tabStatus} /> : null}
                  <span className="workspace-tab-rail-title-text">{tab.title}</span>
                </button>
              )}
              {showTabNumbers ? (
                <span className="workspace-tab-rail-shortcut-number" aria-hidden="true">
                  {index + 1}
                </span>
              ) : tabs.length > 1 ? (
                <button
                  type="button"
                  className="workspace-tab-rail-close"
                  title="Close tab"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    dismissWorkspacePortals()
                    closeTab(tab.id).catch(console.error)
                  }}
                >
                  <WorkbenchIcon name="close" size={13} />
                </button>
              ) : null}
            </div>
          </div>
          )
        })}
        {dropIndex === tabs.length && <div className="workspace-tab-rail-drop-indicator" />}
      </div>
      <button
        type="button"
        className="workspace-tab-rail-add"
        onClick={() => addTab()}
        title="New workspace tab (Cmd+N)"
      >
        <WorkbenchIcon name="plus" size={15} />
      </button>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}

// Re-export for callers that already import switchToTab from this module.
export { switchToWorkspaceTab as switchToTab } from '../workspaceNavigation'
