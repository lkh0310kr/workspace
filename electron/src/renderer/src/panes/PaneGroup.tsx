import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { TabNode } from "flexlayout-react";
import { PaneFrame } from "../components/PaneFrame";
import { PaneTabStrip } from "../components/PaneTabStrip";
import { TreeView } from "../components/TreeView";
import {
  addTabToGroup,
  closeTabInGroup,
  setActiveTabInGroup,
  splitTabSet,
  updateTabInGroup,
} from "../layout/layoutActions";
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

function isEditorKind(kind: TabKind): boolean {
  return kind === "code" || kind === "markdown";
}

export function PaneGroup({ tabNode, workspaceTabId, rootPath, visible, onNotifyChanged }: Props) {
  const config = (tabNode.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
  const tabs = config.tabs;
  const activeTabId = config.activeTabId;
  const activeItem = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const zoom = config.zoom ?? 1;

  const [dirtyByTabId, setDirtyByTabId] = useState<Record<string, boolean>>({});
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeWidth, setTreeWidth] = useState(200);
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const model = tabNode.getModel();
  const nodeId = tabNode.getId();

  const selectTab = useCallback(
    (id: string) => {
      setActiveTabInGroup(model, nodeId, id);
      onNotifyChanged();
    },
    [model, nodeId, onNotifyChanged],
  );

  const closeTab = useCallback(
    (id: string) => {
      closeTabInGroup(model, nodeId, id);
      onNotifyChanged();
    },
    [model, nodeId, onNotifyChanged],
  );

  const newTab = useCallback(
    (kind: TabKind) => {
      addTabToGroup(model, nodeId, kind).then(onNotifyChanged).catch(console.error);
    },
    [model, nodeId, onNotifyChanged],
  );

  const splitPane = useCallback(
    (mode: "split-right" | "split-down", kind: TabKind) => {
      const tabSetId = tabNode.getParent()?.getId();
      if (!tabSetId) return;
      splitTabSet(model, tabSetId, mode === "split-right" ? "right" : "down", kind)
        .then(onNotifyChanged)
        .catch(console.error);
    },
    [model, tabNode, onNotifyChanged],
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
      addTabToGroup(model, nodeId, kind, { filePath: path }).then(onNotifyChanged).catch(console.error);
    },
    [tabs, model, nodeId, selectTab, onNotifyChanged],
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

  const explorerToggle = isEditorKind(activeItem.kind) ? (
    <button
      type="button"
      className={`pane-action pane-explorer-toggle${treeOpen ? " active" : ""}`}
      title="Toggle file explorer"
      onClick={() => setTreeOpen((v) => !v)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.586a1 1 0 0 1 .707.293l1.414 1.414A1 1 0 0 0 10.414 3.5H13A1.5 1.5 0 0 1 14.5 5v8.5A1.5 1.5 0 0 1 13 15H3A1.5 1.5 0 0 1 1.5 13.5v-11Z"
        />
      </svg>
    </button>
  ) : null;

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
          onSplit={splitPane}
          extraActions={explorerToggle}
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
              <div key={item.id} className="pane-group-content-item" style={{ display: active ? "flex" : "none" }}>
                {item.kind === "terminal" && (
                  <TerminalPane terminalId={item.terminalId ?? 0} active={visible && active} zoom={zoom} />
                )}
                {item.kind === "browser" && (
                  <BrowserContent
                    tabId={workspaceTabId}
                    item={item}
                    visible={visible && active}
                    onUpdate={(patch) => updateItem(item.id, patch)}
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
