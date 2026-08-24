import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { TabNode } from "flexlayout-react";
import { PaneFrame } from "../components/PaneFrame";
import { PaneTabStrip } from "../components/PaneTabStrip";
import { TreeView } from "../components/TreeView";
import {
  addTabToGroup,
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
  visible: boolean;
  onNotifyChanged: () => void;
}

const TREE_MIN_WIDTH = 120;
const TREE_MAX_WIDTH = 480;

// The file-explorer toggle/width used to reset to the defaults (open,
// 200px) on every mount — every pane remount (workspace-tab switch, app
// restart) silently discarded it. Persisted per-pane (keyed by the
// flexlayout node id), not as one shared value across every pane —
// TreeView belongs to a single pane's own file-browsing context, so two
// different panes/splits need to be able to have it open/closed (and
// sized) independently of each other.
const TREE_OPEN_KEY = "workspace.editorTreeOpen";
const TREE_WIDTH_KEY = "workspace.editorTreeWidth";

function getStoredTreeOpen(nodeId: string): boolean {
  const stored = localStorage.getItem(`${TREE_OPEN_KEY}.${nodeId}`);
  return stored === null ? true : stored === "1";
}

function getStoredTreeWidth(nodeId: string): number {
  const stored = Number(localStorage.getItem(`${TREE_WIDTH_KEY}.${nodeId}`));
  return Number.isFinite(stored) && stored > 0 ? stored : 200;
}

function isEditorKind(kind: TabKind): boolean {
  return kind === "code" || kind === "markdown";
}

export function PaneGroup({ tabNode, workspaceTabId, rootPath, visible, onNotifyChanged }: Props) {
  const config = (tabNode.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
  const tabs = config.tabs;
  const zoom = config.zoom ?? 1;

  // Which tab is displayed is local React state, not derived straight from
  // the flexlayout model — switching used to go through
  // setActiveTabInGroup + onNotifyChanged (a full model mutation +
  // App-level modelEpoch bump + persistLayout debounce) on every click,
  // which round-trips through flexlayout's own re-render before the
  // screen actually updates. Reported as "탭 이동이 orca처럼 부드럽지
  // 않음 / 안 되는 케이스가 너무 많음" — switching feels laggy and
  // sometimes just doesn't visibly update. Local state makes the switch
  // itself instant and synchronous; the effect below still writes it
  // through to the model afterward so it's persisted, exactly like a
  // debounced autosave.
  const model = tabNode.getModel();
  const nodeId = tabNode.getId();

  const [localActiveId, setLocalActiveId] = useState(config.activeTabId);
  const [dirtyByTabId, setDirtyByTabId] = useState<Record<string, boolean>>({});
  const [treeOpen, setTreeOpenState] = useState(() => getStoredTreeOpen(nodeId));
  const [treeWidth, setTreeWidthState] = useState(() => getStoredTreeWidth(nodeId));
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const setTreeOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setTreeOpenState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        localStorage.setItem(`${TREE_OPEN_KEY}.${nodeId}`, value ? "1" : "0");
        return value;
      });
    },
    [nodeId],
  );

  const setTreeWidth = useCallback(
    (next: number | ((prev: number) => number)) => {
      setTreeWidthState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        localStorage.setItem(`${TREE_WIDTH_KEY}.${nodeId}`, String(value));
        return value;
      });
    },
    [nodeId],
  );

  // If our local pointer no longer refers to an existing tab (the model's
  // own activeTabId moved for a reason other than the user clicking a tab
  // here — e.g. a tab this component previously pointed at was closed by
  // some other path), fall back to whatever the model currently says.
  useEffect(() => {
    if (!tabs.some((t) => t.id === localActiveId)) {
      setLocalActiveId(config.activeTabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, config.activeTabId]);

  useEffect(() => {
    if (localActiveId === config.activeTabId) return;
    setActiveTabInGroup(model, nodeId, localActiveId);
    onNotifyChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localActiveId]);

  const activeItem = tabs.find((t) => t.id === localActiveId) ?? tabs[0];

  const selectTab = useCallback((id: string) => {
    setLocalActiveId(id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const nextActive = closeTabInGroup(model, nodeId, id);
      if (nextActive) setLocalActiveId(nextActive);
      onNotifyChanged();
    },
    [model, nodeId, onNotifyChanged],
  );

  const newTab = useCallback(
    (kind: TabKind) => {
      addTabToGroup(model, nodeId, kind)
        .then((id) => {
          if (id) setLocalActiveId(id);
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [model, nodeId, onNotifyChanged],
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
          if (id) setLocalActiveId(id);
          onNotifyChanged();
        })
        .catch(console.error);
    },
    [tabs, model, nodeId, selectTab, onNotifyChanged],
  );

  const dropTab = useCallback(
    (payload: TabDragPayload, index: number) => {
      const movedId = moveTabToGroup(model, payload.sourceTabNodeId, payload.tabId, nodeId, index);
      if (movedId) setLocalActiveId(movedId);
      onNotifyChanged();
    },
    [model, nodeId, onNotifyChanged],
  );

  const onTreeResizeMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    treeResizeRef.current = { startX: e.clientX, startWidth: treeWidth };
    const onMouseMove = (ev: MouseEvent) => {
      const drag = treeResizeRef.current;
      if (!drag) return;
      const next = drag.startWidth + (ev.clientX - drag.startX);
      setTreeWidth(Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, next)));
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
  const showExplorer = treeOpen && isEditorKind(activeItem.kind);

  return (
    <PaneFrame
      header={
        <PaneTabStrip
          tabNode={tabNode}
          items={tabs}
          activeTabId={activeItem.id}
          isDirty={(item) => dirtyByTabId[item.id] ?? false}
          onSelect={selectTab}
          onClose={closeTab}
          onNewTab={newTab}
          onDropTab={dropTab}
        />
      }
    >
      <div className="pane-group-body">
        {showExplorer && (
          <div className="obsidian-explorer" style={{ width: treeWidth }}>
            <TreeView
              tabId={workspaceTabId}
              rootPath={rootPath}
              selectedPath={activeItem.filePath ?? null}
              onOpenFile={openOrSwitchToFile}
            />
          </div>
        )}
        {showExplorer && <div className="obsidian-explorer-resizer" onMouseDown={onTreeResizeMouseDown} />}
        <div className="pane-group-content">
          {tabs.map((item) => {
            const active = item.id === activeItem.id;
            return (
              <div
                key={item.id}
                className="pane-group-content-item"
                // visibility, not display:none — an Electron <webview>'s
                // guest renderer can get suspended/blanked when an
                // ancestor is display:none (Chromium stops compositing
                // it), which showed up as a background browser tab coming
                // back blank/frozen after switching to it. visibility:
                // hidden keeps the guest alive and painting in the
                // background, same as BrowserPane.tsx already relied on
                // for workspace-tab visibility before this rework.
                style={{ visibility: active ? "visible" : "hidden", pointerEvents: active ? "auto" : "none" }}
              >
                {item.kind === "terminal" && (
                  <TerminalPane terminalId={item.terminalId ?? 0} active={visible && active} zoom={zoom} />
                )}
                {item.kind === "browser" && (
                  <BrowserContent
                    tabId={workspaceTabId}
                    item={item}
                    visible={visible && active}
                    onUpdate={(patch) => updateItem(item.id, patch)}
                    onOpenNewTab={(url) =>
                      addTabToGroup(model, nodeId, "browser", { url })
                        .then((id) => {
                          if (id) setLocalActiveId(id);
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
                    treeOpen={treeOpen}
                    onToggleTree={() => setTreeOpen((v) => !v)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PaneFrame>
  );
}
