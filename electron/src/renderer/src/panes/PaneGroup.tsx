import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Actions, type TabNode } from 'flexlayout-react'
import { PaneFrame } from '../components/PaneFrame'
import { PaneTabStrip } from '../components/PaneTabStrip'
import {
  addTabToGroup,
  changeTabKindInGroup,
  closeTabInGroup,
  moveTabToGroup,
  openFileInPaneGroup,
  setActiveTabInGroup,
  updateTabInGroup
} from '../layout/layoutActions'
import type { TabDragPayload } from '../layout/tabDrag'
import { PaneGroupConfig, PaneTabItem, TabKind } from '../layout/paneTypes'
import { getPaneKind, type PaneRenderContext } from './paneKindRegistry'
import { paneTabStoreKey } from '../store/paneTabKey'
import { useLayoutRevision } from '../hooks/useLayoutRevision'
import { useWorkspaceStore } from '../store/workspaceStore'
import { countLayoutTabSets } from '../layout/layoutModelParse'
import { layoutLog } from '../layout/layoutDebugLog'
import { paneChipContentShown, paneChipContentStyle } from '../interaction/embedPolicy'
import { interactionCoordinator } from '../interaction/InteractionCoordinator'
import { usePaneVisibility } from './usePaneVisibility'
import { usePaneGroupExplorerChrome } from '../hooks/usePaneGroupExplorerChrome'
import { WorkspaceExplorerSidebar } from '../components/WorkspaceExplorerSidebar'
import {
  paneGroupHostClassNames,
  resolvePaneGroupTabSetId
} from './paneGroupFocus'

interface Props {
  tabNode: TabNode
  workspaceTabId: number
  rootPath: string
  onNotifyChanged: () => void
}

function hasFileExplorerSidebar(kind: TabKind): boolean {
  return getPaneKind(kind).hasFileExplorer === true
}

export function PaneGroup({ tabNode, workspaceTabId, rootPath, onNotifyChanged }: Props) {
  const visible = usePaneVisibility(workspaceTabId, tabNode)
  const layoutRevision = useLayoutRevision(workspaceTabId)
  const config = (tabNode.getConfig() ?? { tabs: [], activeTabId: '' }) as PaneGroupConfig
  const tabs = config.tabs
  void layoutRevision
  const zoom = config.zoom ?? 1

  const model = tabNode.getModel()
  const nodeId = tabNode.getId()
  const tabSetId = resolvePaneGroupTabSetId(tabNode.getParent())

  const hasSplitGroups = useMemo(
    () => countLayoutTabSets(model) > 1,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, layoutRevision]
  )
  const focusedTabSetId = useWorkspaceStore(
    (s) => s.focusedPaneGroupTabSetByWorkspaceTab[workspaceTabId]
  )
  const setFocusedPaneGroupTabSet = useWorkspaceStore((s) => s.setFocusedPaneGroupTabSet)

  useEffect(() => {
    if (focusedTabSetId || !tabSetId) return
    const active = model.getActiveTabset()?.getId()
    if (active) setFocusedPaneGroupTabSet(workspaceTabId, active)
  }, [focusedTabSetId, model, tabSetId, workspaceTabId, setFocusedPaneGroupTabSet])

  const isGroupFocused = tabSetId != null && tabSetId === focusedTabSetId

  const focusGroup = useCallback(() => {
    if (!tabSetId || isGroupFocused) return
    setFocusedPaneGroupTabSet(workspaceTabId, tabSetId)
    model.doAction(Actions.setActiveTabset(tabSetId))
  }, [model, tabSetId, isGroupFocused, workspaceTabId, setFocusedPaneGroupTabSet])

  const hostClassName = paneGroupHostClassNames({ hasSplitGroups, isFocused: isGroupFocused })

  const storeKey = paneTabStoreKey(workspaceTabId, nodeId)
  const paneHostRef = useRef<HTMLDivElement>(null)
  const localActiveId = useWorkspaceStore(
    (s) => s.activePaneTabByKey[storeKey] ?? config.activeTabId
  )
  const setActivePaneTab = useWorkspaceStore((s) => s.setActivePaneTab)
  const explorerChrome = usePaneGroupExplorerChrome(workspaceTabId, nodeId)
  const [dirtyByTabId, setDirtyByTabId] = useState<Record<string, boolean>>({})
  const [pendingJumpByTabId, setPendingJumpByTabId] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!tabs.some((t) => t.id === localActiveId)) {
      setActivePaneTab(workspaceTabId, nodeId, config.activeTabId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, config.activeTabId, localActiveId, workspaceTabId, nodeId, setActivePaneTab])

  useEffect(() => {
    if (localActiveId === config.activeTabId) return
    setActiveTabInGroup(model, nodeId, localActiveId)
    onNotifyChanged()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localActiveId])

  const activeItem = tabs.find((t) => t.id === localActiveId) ?? tabs[0]

  useEffect(() => {
    for (const item of tabs) {
      if (item.kind !== 'browser') continue
      const chipActive = item.id === localActiveId
      interactionCoordinator.setBrowserPaneVisible(workspaceTabId, item.id, visible)
      interactionCoordinator.setBrowserChipActive(workspaceTabId, item.id, chipActive)
    }
  }, [localActiveId, tabs, visible, workspaceTabId, nodeId])

  const selectTab = useCallback(
    (id: string) => {
      setActivePaneTab(workspaceTabId, nodeId, id)
    },
    [workspaceTabId, nodeId, setActivePaneTab]
  )

  const closeTab = useCallback(
    (id: string) => {
      void closeTabInGroup(model, nodeId, id)
        .then((nextActive) => {
          if (nextActive) setActivePaneTab(workspaceTabId, nodeId, nextActive)
          onNotifyChanged()
        })
        .catch(console.error)
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab]
  )

  const newTab = useCallback(
    (kind: TabKind, source?: Partial<PaneTabItem>) => {
      addTabToGroup(model, nodeId, kind, source)
        .then((id) => {
          if (id) setActivePaneTab(workspaceTabId, nodeId, id)
          onNotifyChanged()
        })
        .catch(console.error)
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab]
  )

  const changeKind = useCallback(
    (tabId: string, kind: TabKind) => {
      changeTabKindInGroup(model, nodeId, tabId, kind)
        .then((id) => {
          if (id) setActivePaneTab(workspaceTabId, nodeId, id)
          onNotifyChanged()
        })
        .catch(console.error)
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab]
  )

  const updateItem = useCallback(
    (id: string, patch: Partial<PaneTabItem>) => {
      updateTabInGroup(model, nodeId, id, patch)
      onNotifyChanged()
    },
    [model, nodeId, onNotifyChanged]
  )

  const openOrSwitchToFile = useCallback(
    (path: string, kind: 'code' | 'markdown' | 'viewer', jumpToLine?: number, pin?: boolean) => {
      const existing = tabs.find((t) => t.filePath === path)
      if (existing) {
        selectTab(existing.id)
        if (pin && existing.isPreview) {
          updateTabInGroup(model, nodeId, existing.id, { isPreview: false })
          onNotifyChanged()
        }
        if (jumpToLine != null) {
          setPendingJumpByTabId((prev) => ({ ...prev, [existing.id]: jumpToLine }))
        }
        return
      }
      void openFileInPaneGroup(model, nodeId, path, kind, {
        pin,
        jumpToLine,
        isDirty: (id) => dirtyByTabId[id] ?? false,
        onJumpToLine: (id, line) => setPendingJumpByTabId((prev) => ({ ...prev, [id]: line }))
      })
        .then((id) => {
          if (!id) return
          setActivePaneTab(workspaceTabId, nodeId, id)
          onNotifyChanged()
        })
        .catch(console.error)
    },
    [
      tabs,
      model,
      nodeId,
      selectTab,
      onNotifyChanged,
      dirtyByTabId,
      workspaceTabId,
      setActivePaneTab
    ]
  )

  const dropTab = useCallback(
    (payload: TabDragPayload, index: number) => {
      layoutLog(
        'PaneGroup.dropTab',
        'strip drop handler',
        {
          payload,
          index,
          nodeId,
          workspaceTabId
        },
        workspaceTabId
      )
      const movedId = moveTabToGroup(model, payload.sourceTabNodeId, payload.tabId, nodeId, index)
      if (movedId) setActivePaneTab(workspaceTabId, nodeId, movedId)
      onNotifyChanged()
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab]
  )

  if (!activeItem) return null

  const hasExplorer = tabs.some((t) => hasFileExplorerSidebar(t.kind))
  const treeOpen = explorerChrome.treeOpen
  const onToggleTree = () => explorerChrome.setTreeOpen((v) => !v)

  return (
    <div
      className={hostClassName}
      data-pane-node-id={nodeId}
      data-pane-tabset-id={tabSetId}
      data-pane-group-focused={isGroupFocused ? 'true' : 'false'}
      data-pane-split-groups={hasSplitGroups ? 'true' : 'false'}
      ref={paneHostRef}
      onPointerDown={focusGroup}
      onFocusCapture={focusGroup}
    >
      {hasExplorer && (
        <WorkspaceExplorerSidebar
          workspaceTabId={workspaceTabId}
          nodeId={nodeId}
          rootPath={rootPath}
          model={model}
          paneVisible={visible}
          focusHostRef={paneHostRef}
          selectedPath={activeItem.filePath ?? null}
          chrome={explorerChrome}
          onOpenFile={openOrSwitchToFile}
          onNotifyChanged={onNotifyChanged}
        />
      )}
      <PaneFrame
        header={
          <PaneTabStrip
            tabNode={tabNode}
            items={tabs}
            activeTabId={activeItem.id}
            paneVisible={visible}
            isDirty={(item) => dirtyByTabId[item.id] ?? false}
            onSelect={selectTab}
            onClose={closeTab}
            onNewTab={newTab}
            onChangeKind={changeKind}
            onUpdateTab={updateItem}
            onDropTab={dropTab}
          />
        }
      >
        <div className="pane-group-body">
          <div className="pane-group-content">
            {tabs.map((item) => {
              const active = item.id === activeItem.id
              const chipShown = paneChipContentShown(visible, active)
              const ctx: PaneRenderContext = {
                workspaceTabId,
                nodeId,
                rootPath,
                model,
                item,
                active,
                paneVisible: visible,
                chipShown,
                zoom,
                dirty: dirtyByTabId[item.id] ?? false,
                setDirty: (dirty) => setDirtyByTabId((prev) => ({ ...prev, [item.id]: dirty })),
                treeOpen,
                onToggleTree,
                jumpToLine: pendingJumpByTabId[item.id],
                onJumpConsumed: () =>
                  setPendingJumpByTabId((prev) => {
                    if (!(item.id in prev)) return prev
                    const next = { ...prev }
                    delete next[item.id]
                    return next
                  }),
                updateItem: (patch) => updateItem(item.id, patch),
                openOrSwitchToFile,
                openNewTab: newTab
              }
              return (
                <div
                  key={item.id}
                  className="pane-group-content-item"
                  style={paneChipContentStyle(visible, active)}
                >
                  {getPaneKind(item.kind).render(ctx)}
                </div>
              )
            })}
          </div>
        </div>
      </PaneFrame>
    </div>
  )
}
