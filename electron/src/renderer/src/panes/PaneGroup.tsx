import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { TabNode } from "flexlayout-react";
import { PaneFrame } from "../components/PaneFrame";
import { PaneTabStrip } from "../components/PaneTabStrip";
import { TreeView } from "../components/TreeView";
import {
  addTabToGroup,
  changeTabKindInGroup,
  closeTabInGroup,
  moveTabToGroup,
  setActiveTabInGroup,
  updateTabInGroup,
} from "../layout/layoutActions";
import type { TabDragPayload } from "../layout/tabDrag";
import { PaneGroupConfig, PaneTabItem, TabKind } from "../layout/paneTypes";
import { EditorContent } from "./EditorContent";
import { BrowserContent } from "./BrowserContent";
import { TerminalPane } from "./TerminalPane";
import { paneTabStoreKey } from "../store/paneTabKey";
import { useLayoutRevision } from "../hooks/useLayoutRevision";
import { useWorkspaceStore } from "../store/workspaceStore";
import { layoutLog } from "../layout/layoutDebugLog";
import { dbgLog } from "../interaction/interactionDebugLog";
import { paneChipContentShown, paneChipContentStyle } from "../interaction/embedPolicy";
import { usePaneVisibility } from "./usePaneVisibility";

// The pane-level orchestrator that makes the tab system "global": every
// flexlayout pane node now renders one of these instead of switching on a
// single component type. It owns the tab strip (PaneTabStrip) and the
// file explorer sidebar (only shown while the active tab is an editor
// kind — the explorer is scoped to the pane's rootPath, not to any one
// open file, so it lives here rather than duplicated per editor tab like
// ui/EditorPane.tsx used to). Every open tab's content component stays
// mounted the whole time (just hidden via CSS when inactive) so switching
// tabs never loses terminal scrollback, browser page state, or an editor
// draft — the same reason BrowserPane.tsx already did this for
// workspace-tab visibility before this change.
interface Props {
  tabNode: TabNode;
  workspaceTabId: number;
  rootPath: string;
  onNotifyChanged: () => void;
}

const TREE_MIN_WIDTH = 120;
const TREE_MAX_WIDTH = 480;

// The file-explorer toggle/width used to reset to the defaults (open,
// 200px) on every mount — every pane remount (workspace-tab switch, app
// restart) silently discarded it. Persisted per-tab (keyed by the tab
// item's own id), not per-pane and not as one shared value across every
// pane — confirmed directly ("TODO.md 탭이랑 New tab이 같은 pane 안의 두
// 탭"): two editor tabs in the very same pane still need independent
// open/closed (and sized) explorer state, not just two different
// panes/splits.
const TREE_OPEN_KEY = "workspace.editorTreeOpen";
const TREE_WIDTH_KEY = "workspace.editorTreeWidth";

function getStoredTreeOpen(tabId: string): boolean {
  const stored = localStorage.getItem(`${TREE_OPEN_KEY}.${tabId}`);
  return stored === null ? true : stored === "1";
}

function getStoredTreeWidth(tabId: string): number {
  const stored = Number(localStorage.getItem(`${TREE_WIDTH_KEY}.${tabId}`));
  return Number.isFinite(stored) && stored > 0 ? stored : 200;
}

function isEditorKind(kind: TabKind): boolean {
  return kind === "code" || kind === "markdown";
}

export function PaneGroup({ tabNode, workspaceTabId, rootPath, onNotifyChanged }: Props) {
  const visible = usePaneVisibility(workspaceTabId, tabNode);
  const layoutRevision = useLayoutRevision(workspaceTabId);
  const config = (tabNode.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
  const tabs = config.tabs;
  void layoutRevision;
  const zoom = config.zoom ?? 1;

  // Which tab is displayed is local React state, not derived straight from
  // the flexlayout model — switching used to go through
  // setActiveTabInGroup + onNotifyChanged (a full model mutation +
  // per-tab layoutRevision bump + persistLayout debounce) on every click,
  // which round-trips through flexlayout's own re-render before the
  // screen actually updates. Reported as "탭 이동이 orca처럼 부드럽지
  // 않음 / 안 되는 케이스가 너무 많음" — switching feels laggy and
  // sometimes just doesn't visibly update. Local state makes the switch
  // itself instant and synchronous; the effect below still writes it
  // through to the model afterward so it's persisted, exactly like a
  // debounced autosave.
  const model = tabNode.getModel();
  const nodeId = tabNode.getId();

  const storeKey = paneTabStoreKey(workspaceTabId, nodeId);
  const localActiveId = useWorkspaceStore(
    (s) => s.activePaneTabByKey[storeKey] ?? config.activeTabId,
  );
  const setActivePaneTab = useWorkspaceStore((s) => s.setActivePaneTab);
  const [dirtyByTabId, setDirtyByTabId] = useState<Record<string, boolean>>({});
  // Sparse overrides on top of localStorage — a tab id only appears here
  // once its explorer state has actually been touched this session;
  // until then treeOpenFor/treeWidthFor fall through to the stored (or
  // default) value directly, so every *other* tab doesn't need an eager
  // entry just because one tab's state changed.
  const [treeOpenOverrides, setTreeOpenOverrides] = useState<Record<string, boolean>>({});
  const [treeWidthOverrides, setTreeWidthOverrides] = useState<Record<string, number>>({});
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const treeOpenFor = useCallback(
    (tabId: string): boolean => (tabId in treeOpenOverrides ? treeOpenOverrides[tabId] : getStoredTreeOpen(tabId)),
    [treeOpenOverrides],
  );

  const treeWidthFor = useCallback(
    (tabId: string): number =>
      tabId in treeWidthOverrides ? treeWidthOverrides[tabId] : getStoredTreeWidth(tabId),
    [treeWidthOverrides],
  );

  const setTreeOpenForTab = useCallback((tabId: string, next: boolean | ((prev: boolean) => boolean)) => {
    setTreeOpenOverrides((prev) => {
      const prevValue = tabId in prev ? prev[tabId] : getStoredTreeOpen(tabId);
      const value = typeof next === "function" ? next(prevValue) : next;
      localStorage.setItem(`${TREE_OPEN_KEY}.${tabId}`, value ? "1" : "0");
      return { ...prev, [tabId]: value };
    });
  }, []);

  const setTreeWidthForTab = useCallback((tabId: string, next: number | ((prev: number) => number)) => {
    setTreeWidthOverrides((prev) => {
      const prevValue = tabId in prev ? prev[tabId] : getStoredTreeWidth(tabId);
      const value = typeof next === "function" ? next(prevValue) : next;
      localStorage.setItem(`${TREE_WIDTH_KEY}.${tabId}`, String(value));
      return { ...prev, [tabId]: value };
    });
  }, []);

  // If our local pointer no longer refers to an existing tab (the model's
  // own activeTabId moved for a reason other than the user clicking a tab
  // here — e.g. a tab this component previously pointed at was closed by
  // some other path), fall back to whatever the model currently says.
  useEffect(() => {
    if (!tabs.some((t) => t.id === localActiveId)) {
      setActivePaneTab(workspaceTabId, nodeId, config.activeTabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, config.activeTabId, localActiveId, workspaceTabId, nodeId, setActivePaneTab]);

  useEffect(() => {
    if (localActiveId === config.activeTabId) return;
    setActiveTabInGroup(model, nodeId, localActiveId);
    onNotifyChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localActiveId]);

  const activeItem = tabs.find((t) => t.id === localActiveId) ?? tabs[0];

  // #region agent log
  useEffect(() => {
    if (!localActiveId || tabs.some((t) => t.id === localActiveId)) return;
    dbgLog(
      "PaneGroup:tabsStale",
      "localActiveId missing from tabs",
      { layoutRevision, localActiveId, tabIds: tabs.map((t) => t.id), nodeId, workspaceTabId },
      "H7",
    );
  }, [layoutRevision, localActiveId, tabs, nodeId, workspaceTabId]);
  // #endregion

  const selectTab = useCallback(
    (id: string) => {
      setActivePaneTab(workspaceTabId, nodeId, id);
    },
    [workspaceTabId, nodeId, setActivePaneTab],
  );

  const closeTab = useCallback(
    (id: string) => {
      const nextActive = closeTabInGroup(model, nodeId, id);
      if (nextActive) setActivePaneTab(workspaceTabId, nodeId, nextActive);
      onNotifyChanged();
    },
    [model, nodeId, onNotifyChanged],
  );

  const newTab = useCallback(
    (kind: TabKind) => {
      // #region agent log
      dbgLog(
        "PaneGroup:newTab",
        "add tab requested",
        { kind, nodeId, workspaceTabId, visible, activeItemId: activeItem?.id },
        kind === "browser" ? "H5" : "H6",
      );
      // #endregion
      addTabToGroup(model, nodeId, kind)
        .then((id) => {
          // #region agent log
          dbgLog(
            "PaneGroup:newTab",
            "add tab resolved",
            { kind, newTabId: id, nodeId, workspaceTabId },
            kind === "browser" ? "H5" : "H6",
          );
          // #endregion
          if (id) setActivePaneTab(workspaceTabId, nodeId, id);
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab, visible, activeItem?.id],
  );

  const changeKind = useCallback(
    (tabId: string, kind: TabKind) => {
      changeTabKindInGroup(model, nodeId, tabId, kind)
        .then((id) => {
          if (id) setActivePaneTab(workspaceTabId, nodeId, id);
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<PaneTabItem>) => {
      updateTabInGroup(model, nodeId, id, patch);
      onNotifyChanged();
    },
    [model, nodeId, onNotifyChanged],
  );

  const openOrSwitchToFile = useCallback(
    (path: string, kind: "code" | "markdown") => {
      const existing = tabs.find((t) => t.filePath === path);
      if (existing) {
        selectTab(existing.id);
        return;
      }
      addTabToGroup(model, nodeId, kind, { filePath: path })
        .then((id) => {
          if (id) setActivePaneTab(workspaceTabId, nodeId, id);
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [tabs, model, nodeId, selectTab, onNotifyChanged],
  );

  const dropTab = useCallback(
    (payload: TabDragPayload, index: number) => {
      layoutLog("PaneGroup.dropTab", "strip drop handler", {
        payload,
        index,
        nodeId,
        workspaceTabId,
      }, workspaceTabId);
      const movedId = moveTabToGroup(model, payload.sourceTabNodeId, payload.tabId, nodeId, index);
      if (movedId) setActivePaneTab(workspaceTabId, nodeId, movedId);
      onNotifyChanged();
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab],
  );

  const onTreeResizeMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    const tabId = activeItem.id;
    treeResizeRef.current = { startX: e.clientX, startWidth: treeWidthFor(tabId) };
    const onMouseMove = (ev: MouseEvent) => {
      const drag = treeResizeRef.current;
      if (!drag) return;
      const next = drag.startWidth + (ev.clientX - drag.startX);
      setTreeWidthForTab(tabId, Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, next)));
    };
    const onMouseUp = () => {
      treeResizeRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!activeItem) return null;
  const showExplorer = treeOpenFor(activeItem.id) && isEditorKind(activeItem.kind);

  return (
    <div className="pane-group-host">
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
          onDropTab={dropTab}
        />
      }
    >
      <div className="pane-group-body">
        {showExplorer && (
          <div className="obsidian-explorer" style={{ width: treeWidthFor(activeItem.id) }}>
            <TreeView
              tabId={workspaceTabId}
              rootPath={rootPath}
              selectedPath={activeItem.filePath ?? null}
              paneVisible={visible}
              onOpenFile={openOrSwitchToFile}
            />
          </div>
        )}
        {showExplorer && <div className="obsidian-explorer-resizer" onMouseDown={onTreeResizeMouseDown} />}
        <div className="pane-group-content">
          {tabs.map((item) => {
            const active = item.id === activeItem.id;
            const chipShown = paneChipContentShown(visible, active);
            return (
              <div
                key={item.id}
                className="pane-group-content-item"
                style={paneChipContentStyle(visible, active)}
              >
                {item.kind === "terminal" && (
                  <TerminalPane
                    terminalId={item.terminalId ?? 0}
                    visible={chipShown}
                    active={active}
                    zoom={zoom}
                  />
                )}
                {item.kind === "browser" && (
                  <BrowserContent
                    tabId={workspaceTabId}
                    paneNodeId={nodeId}
                    item={item}
                    visible={chipShown}
                    onUpdate={(patch) => updateItem(item.id, patch)}
                    onOpenNewTab={(url) =>
                      addTabToGroup(model, nodeId, "browser", { url })
                        .then((id) => {
                          if (id) setActivePaneTab(workspaceTabId, nodeId, id);
                          onNotifyChanged();
                        })
                        .catch(console.error)
                    }
                  />
                )}
                {(item.kind === "code" || item.kind === "markdown") && (
                  <EditorContent
                    tabId={workspaceTabId}
                    rootPath={rootPath}
                    filePath={item.filePath ?? null}
                    kind={item.kind}
                    zoom={zoom}
                    onOpenFile={(path) => openOrSwitchToFile(path, "markdown")}
                    onAssignPath={(path) => updateItem(item.id, { filePath: path })}
                    onDirtyChange={(dirty) => setDirtyByTabId((prev) => ({ ...prev, [item.id]: dirty }))}
                    treeOpen={treeOpenFor(item.id)}
                    onToggleTree={() => setTreeOpenForTab(item.id, (v) => !v)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PaneFrame>
    </div>
  );
}
