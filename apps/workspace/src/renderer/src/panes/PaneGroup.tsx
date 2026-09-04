import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type TabNode } from 'flexlayout-react'
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
import { activatePaneTab, readPaneGroupConfig, resolveActivePaneTabId } from '../layout/layoutSession'
import type { TabDragPayload } from '../layout/tabDrag'
import { PaneTabItem, TabKind } from '../layout/paneTypes'
import { getPaneKind, type PaneRenderContext } from './paneKindRegistry'
import { useLayoutRevision } from '../hooks/useLayoutRevision'
import { useWorkspaceStore } from '../store/workspaceStore'
import { countLayoutTabSets } from '../layout/layoutModelParse'
import { focusPaneGroupTabSet } from '../layout/layoutRef'
import { layoutLog } from '../layout/layoutDebugLog'
import { paneChipContentShown, paneChipContentStyle } from '../interaction/embedPolicy'
import { usePaneVisibility } from './usePaneVisibility'
import { usePaneGroupExplorerChrome } from '../hooks/usePaneGroupExplorerChrome'
import { WorkspaceExplorerSidebar } from '../components/WorkspaceExplorerSidebar'
import { BrowserPaneOverlaySlot } from './BrowserPaneOverlaySlot'
import { BrowserContent } from './BrowserContent'
import { paneGroupBodyAnchorName } from './paneGroupBodyAnchor'
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

function activeChipHasExplorer(kind: TabKind): boolean {
  return getPaneKind(kind).hasFileExplorer === true
}

export function PaneGroup({ tabNode, workspaceTabId, rootPath, onNotifyChanged }: Props) {
  const visible = usePaneVisibility(workspaceTabId, tabNode)
  const layoutRevision = useLayoutRevision(workspaceTabId)
  const config = readPaneGroupConfig(tabNode)
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
    if (!tabSetId) return
    focusPaneGroupTabSet(workspaceTabId, tabSetId)
  }, [tabSetId, workspaceTabId])

  const hostClassName = paneGroupHostClassNames({ hasSplitGroups, isFocused: isGroupFocused })

  const paneHostRef = useRef<HTMLDivElement>(null)
  const explorerChrome = usePaneGroupExplorerChrome(workspaceTabId, nodeId)
  const [dirtyByTabId, setDirtyByTabId] = useState<Record<string, boolean>>({})
  const [pendingJumpByTabId, setPendingJumpByTabId] = useState<Record<string, number>>({})

  const activeTabId = resolveActivePaneTabId(config)
  const activeItem = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  const selectTab = useCallback(
    (id: string) => {
      if (activatePaneTab(model, nodeId, id)) onNotifyChanged()
    },
    [model, nodeId, onNotifyChanged]
  )

  const closeTab = useCallback(
    (id: string) => {
      void closeTabInGroup(model, nodeId, id)
        .then(() => onNotifyChanged())
        .catch(console.error)
    },
    [model, nodeId, onNotifyChanged]
  )

  const newTab = useCallback(
    (kind: TabKind, source?: Partial<PaneTabItem>) => {
      addTabToGroup(model, nodeId, kind, source)
        .then(() => onNotifyChanged())
        .catch(console.error)
    },
    [model, nodeId, onNotifyChanged]
  )

  const changeKind = useCallback(
    (tabId: string, kind: TabKind) => {
      changeTabKindInGroup(model, nodeId, tabId, kind)
        .then(() => onNotifyChanged())
        .catch(console.error)
    },
    [model, nodeId, onNotifyChanged]
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
          setActiveTabInGroup(model, nodeId, id)
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
      dirtyByTabId
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
      if (movedId) setActiveTabInGroup(model, nodeId, movedId)
      onNotifyChanged()
    },
    [model, nodeId, onNotifyChanged]
  )

  if (!activeItem) return null

  const treeOpen = explorerChrome.treeOpen
  const onToggleTree = () => explorerChrome.setTreeOpen((v) => !v)
  const showExplorer = activeChipHasExplorer(activeItem.kind)
  const hasBrowserTabs = tabs.some((t) => t.kind === 'browser')
  const browserTabs = hasBrowserTabs ? tabs.filter((t) => t.kind === 'browser') : []
  const bodyAnchorStyle = { anchorName: paneGroupBodyAnchorName(nodeId) } as React.CSSProperties

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
        <div className={`pane-group-body${showExplorer ? ' pane-group-body-with-explorer' : ''}`}>
          <div
            className="workspace-explorer-slot"
            style={{ display: showExplorer ? undefined : 'none' }}
          >
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
          </div>
          <div className="pane-group-content" style={bodyAnchorStyle}>
            {hasBrowserTabs ? (
              <BrowserPaneOverlaySlot
                paneNodeId={nodeId}
                paneVisible={visible}
                onFocusOwningGroup={focusGroup}
              >
                <div className="browser-pane-page-stack">
                  {browserTabs.map((item) => {
                    const active = item.id === activeItem.id
                    return (
                      <BrowserContent
                        key={item.id}
                        tabId={workspaceTabId}
                        paneNodeId={nodeId}
                        item={item}
                        paneVisible={visible}
                        chipActive={active}
                        onUpdate={(patch) => updateItem(item.id, patch)}
                        onOpenNewTab={(url) => newTab('browser', { url })}
                        onFocusPaneGroup={focusGroup}
                        onSelectPaneTab={selectTab}
                      />
                    )
                  })}
                </div>
              </BrowserPaneOverlaySlot>
            ) : null}
            {tabs
              .filter((item) => item.kind !== 'browser')
              .map((item) => {
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
                openNewTab: newTab,
                focusPaneGroup: focusGroup,
                selectPaneTab: selectTab
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
