import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { TabNode } from "flexlayout-react";
import { PaneFrame } from "../components/PaneFrame";
import { PaneTabStrip } from "../components/PaneTabStrip";
import { TreeView } from "../components/TreeView";
import { SearchPanel } from "../components/SearchPanel";
import {
  addTabToGroup,
  changeTabKindInGroup,
  closeTabInGroup,
  moveTabToGroup,
  replaceTabInGroup,
  setActiveTabInGroup,
  updateTabInGroup,
} from "../layout/layoutActions";
import type { TabDragPayload } from "../layout/tabDrag";
import { PaneGroupConfig, PaneTabItem, TabKind } from "../layout/paneTypes";
import { getPaneKind, type PaneRenderContext } from "./paneKindRegistry";
import { paneTabStoreKey } from "../store/paneTabKey";
import { useLayoutRevision } from "../hooks/useLayoutRevision";
import { useWorkspaceStore } from "../store/workspaceStore";
import { layoutLog } from "../layout/layoutDebugLog";
import { paneChipContentShown, paneChipContentStyle } from "../interaction/embedPolicy";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { usePaneVisibility } from "./usePaneVisibility";
import { getEngineBundleUrl } from "../electron";

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
const SIDEBAR_MODE_KEY = "workspace.sidebarMode";

type SidebarMode = "explorer" | "search";

function getStoredSidebarMode(tabId: string): SidebarMode {
  return localStorage.getItem(`${SIDEBAR_MODE_KEY}.${tabId}`) === "search" ? "search" : "explorer";
}

function getStoredTreeOpen(tabId: string): boolean {
  const stored = localStorage.getItem(`${TREE_OPEN_KEY}.${tabId}`);
  return stored === null ? true : stored === "1";
}

function getStoredTreeWidth(tabId: string): number {
  const stored = Number(localStorage.getItem(`${TREE_WIDTH_KEY}.${tabId}`));
  return Number.isFinite(stored) && stored > 0 ? stored : 200;
}

function hasFileExplorerSidebar(kind: TabKind): boolean {
  return getPaneKind(kind).hasFileExplorer === true;
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
  const [sidebarModeOverrides, setSidebarModeOverrides] = useState<Record<string, SidebarMode>>({});
  // Ephemeral (never persisted) jump target for a just-opened or
  // already-open editor tab, set by a Find-in-Files result click — cleared
  // once EditorContent reports it consumed. Deliberately local state, not
  // written into PaneTabItem/flexlayout config, which gets saved to disk.
  const [pendingJumpByTabId, setPendingJumpByTabId] = useState<Record<string, number>>({});
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const paneHostRef = useRef<HTMLDivElement>(null);

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

  const sidebarModeFor = useCallback(
    (tabId: string): SidebarMode =>
      tabId in sidebarModeOverrides ? sidebarModeOverrides[tabId] : getStoredSidebarMode(tabId),
    [sidebarModeOverrides],
  );

  const setSidebarModeForTab = useCallback((tabId: string, mode: SidebarMode) => {
    localStorage.setItem(`${SIDEBAR_MODE_KEY}.${tabId}`, mode);
    setSidebarModeOverrides((prev) => ({ ...prev, [tabId]: mode }));
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

  // Keep IC browser chip state aligned when the pane's active tab changes
  // (browser → terminal/editor) so inactive guests hide before paint.
  useEffect(() => {
    for (const item of tabs) {
      if (item.kind !== "browser") continue;
      const chipActive = item.id === localActiveId;
      interactionCoordinator.setBrowserPaneVisible(workspaceTabId, item.id, visible);
      interactionCoordinator.setBrowserChipActive(workspaceTabId, item.id, chipActive);
    }
  }, [localActiveId, tabs, visible, workspaceTabId, nodeId]);

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
    (kind: TabKind, source?: Partial<PaneTabItem>) => {
      addTabToGroup(model, nodeId, kind, source)
        .then((id) => {
          if (id) setActivePaneTab(workspaceTabId, nodeId, id);
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [model, nodeId, onNotifyChanged, workspaceTabId, setActivePaneTab],
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

  // VSCode-style preview tab: a plain TreeView click reuses the current
  // preview tab's slot instead of piling up a new one, *unless* that
  // preview tab has unsaved edits (dirtyByTabId, already tracked for the
  // tab strip's own dirty dot) or `pin` is set (Cmd/Ctrl+click, or
  // double-click promoting an existing preview tab) — see paneTypes.ts's
  // isPreview doc comment.
  const openOrSwitchToFile = useCallback(
    (path: string, kind: "code" | "markdown" | "viewer", jumpToLine?: number, pin?: boolean) => {
      const existing = tabs.find((t) => t.filePath === path);
      if (existing) {
        selectTab(existing.id);
        if (pin && existing.isPreview) {
          updateTabInGroup(model, nodeId, existing.id, { isPreview: false });
          onNotifyChanged();
        }
        if (jumpToLine != null) {
          setPendingJumpByTabId((prev) => ({ ...prev, [existing.id]: jumpToLine }));
        }
        return;
      }
      const previewTab = tabs.find((t) => t.isPreview);
      const previewIsDirty = previewTab ? (dirtyByTabId[previewTab.id] ?? false) : false;
      const open = !pin && previewTab && !previewIsDirty
        ? replaceTabInGroup(model, nodeId, previewTab.id, kind, { filePath: path })
        : addTabToGroup(model, nodeId, kind, { filePath: path });
      open
        .then((id) => {
          if (!id) return;
          if (!pin) updateTabInGroup(model, nodeId, id, { isPreview: true });
          setActivePaneTab(workspaceTabId, nodeId, id);
          if (jumpToLine != null) {
            setPendingJumpByTabId((prev) => ({ ...prev, [id]: jumpToLine }));
          }
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [tabs, model, nodeId, selectTab, onNotifyChanged, dirtyByTabId, workspaceTabId],
  );

  // Keeps this pane's own open tabs pointing at the real file when the
  // tree renames/moves/deletes something out from under them — without
  // this, a tab left pointing at a now-stale path silently recreates the
  // old file on its next save (reported as "moving/deleting a file
  // doesn't get reflected, looks like the file gets copied back").
  // Scoped to this PaneGroup's own tabs only; a file open in a *different*
  // pane/split isn't reachable from here.
  const onTreePathRenamed = useCallback(
    (from: string, to: string) => {
      let changed = false;
      for (const t of tabs) {
        if (!t.filePath) continue;
        if (t.filePath === from) {
          updateTabInGroup(model, nodeId, t.id, { filePath: to });
          changed = true;
        } else if (t.filePath.startsWith(`${from}/`)) {
          updateTabInGroup(model, nodeId, t.id, { filePath: to + t.filePath.slice(from.length) });
          changed = true;
        }
      }
      if (changed) onNotifyChanged();
    },
    [tabs, model, nodeId, onNotifyChanged],
  );

  const onTreePathDeleted = useCallback(
    (path: string) => {
      for (const t of tabs) {
        if (t.filePath === path || t.filePath?.startsWith(`${path}/`)) closeTab(t.id);
      }
    },
    [tabs, closeTab],
  );

  // "Open as App" — a directory holding a pre-built engine Web export
  // (Godot's "Web" export output, or any future engine's) opens as a
  // plain Browser tab pointed at its workspace-engine:// URL. Reuses
  // Browser's already-stable webview lifecycle/InteractionCoordinator
  // registration wholesale instead of a parallel "Engine pane" with its
  // own new lifecycle code — see docs/ROADMAP.md's Phase 2 checklist for
  // why (verification-first: this is the minimal-risk way to prove the
  // hosting protocol works end-to-end against a real Godot export).
  const onTreeOpenAsApp = useCallback(
    (path: string) => {
      getEngineBundleUrl(workspaceTabId, path)
        .then((url) => addTabToGroup(model, nodeId, "browser", { url }))
        .then((id) => {
          if (id) setActivePaneTab(workspaceTabId, nodeId, id);
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [workspaceTabId, model, nodeId, setActivePaneTab, onNotifyChanged],
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

  // Cmd+Shift+F opens the Search sidebar — scoped to this pane (not a
  // global listener in useAppShortcuts.ts) since Find-in-Files needs to
  // know *which* pane's sidebar to switch when multiple panes are visible
  // in the same workspace tab (splits). Mirrors EditorContent.tsx's own
  // per-instance Cmd+S handler rather than threading an "active pane"
  // concept through App.tsx.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "f") return;
      if (!visible || !activeItem) return;
      if (!hasFileExplorerSidebar(activeItem.kind)) return;
      if (!paneHostRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      setSidebarModeForTab(activeItem.id, "search");
      setTreeOpenForTab(activeItem.id, true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, activeItem, setSidebarModeForTab, setTreeOpenForTab]);

  if (!activeItem) return null;
  const showExplorer =
    hasFileExplorerSidebar(activeItem.kind) &&
    (treeOpenFor(activeItem.id) || sidebarModeFor(activeItem.id) === "search");

  return (
    <div className="pane-group-host" data-pane-node-id={nodeId} ref={paneHostRef}>
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
            {sidebarModeFor(activeItem.id) === "search" ? (
              <SearchPanel
                tabId={workspaceTabId}
                onJumpToResult={(path, kind, line) => openOrSwitchToFile(path, kind, line)}
                onClose={() => setSidebarModeForTab(activeItem.id, "explorer")}
              />
            ) : (
              <TreeView
                tabId={workspaceTabId}
                rootPath={rootPath}
                selectedPath={activeItem.filePath ?? null}
                paneVisible={visible}
                onOpenFile={(path, kind, pin) => openOrSwitchToFile(path, kind, undefined, pin)}
                onPathRenamed={onTreePathRenamed}
                onPathDeleted={onTreePathDeleted}
                onOpenAsApp={onTreeOpenAsApp}
              />
            )}
          </div>
        )}
        {showExplorer && <div className="obsidian-explorer-resizer" onMouseDown={onTreeResizeMouseDown} />}
        <div className="pane-group-content">
          {tabs.map((item) => {
            const active = item.id === activeItem.id;
            const chipShown = paneChipContentShown(visible, active);
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
              treeOpen: treeOpenFor(item.id),
              onToggleTree: () => setTreeOpenForTab(item.id, (v) => !v),
              jumpToLine: pendingJumpByTabId[item.id],
              onJumpConsumed: () =>
                setPendingJumpByTabId((prev) => {
                  if (!(item.id in prev)) return prev;
                  const next = { ...prev };
                  delete next[item.id];
                  return next;
                }),
              updateItem: (patch) => updateItem(item.id, patch),
              openOrSwitchToFile,
              openNewTab: newTab,
            };
            return (
              <div
                key={item.id}
                className="pane-group-content-item"
                style={paneChipContentStyle(visible, active)}
              >
                {getPaneKind(item.kind).render(ctx)}
              </div>
            );
          })}
        </div>
      </div>
    </PaneFrame>
    </div>
  );
}
