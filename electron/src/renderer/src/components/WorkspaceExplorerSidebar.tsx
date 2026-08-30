import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Model } from "flexlayout-react";
import { TreeView } from "./TreeView";
import { SearchPanel } from "./SearchPanel";
import { useLayoutRevision } from "../hooks/useLayoutRevision";
import { exportGodotWeb, getEngineBundleUrl, launchWorldEngine, registerProjectApp } from "../electron";
import { logError } from "../errorLog";
import { addTabToGroup } from "../layout/layoutActions";
import { useWorkspaceStore } from "../store/workspaceStore";
import {
  deletePathInAllPanes,
  getExplorerTargetBridge,
  renamePathInAllPanes,
  workspaceHasExplorerPane,
} from "../explorer/workspaceExplorerBridge";
import { workspaceTabKey } from "../explorer/workspaceTabKey";
import { useWorkspaceExplorerChrome } from "../explorer/WorkspaceExplorerContext";

const TREE_MIN_WIDTH = 120;
const TREE_MAX_WIDTH = 480;

interface Props {
  workspaceTabId: number;
  rootPath: string;
  model: Model;
  workspaceTabVisible: boolean;
  focusHostRef: React.RefObject<HTMLElement | null>;
  onNotifyChanged: () => void;
}

export function WorkspaceExplorerSidebar({
  workspaceTabId,
  rootPath,
  model,
  workspaceTabVisible,
  focusHostRef,
  onNotifyChanged,
}: Props) {
  const layoutRevision = useLayoutRevision(workspaceTabId);
  void layoutRevision;
  const { treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode } =
    useWorkspaceExplorerChrome();
  const explorerScrollRef = useRef<HTMLDivElement>(null);
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [, bump] = useState(0);
  const forceUpdate = () => bump((n) => n + 1);

  const bridge = getExplorerTargetBridge(workspaceTabId, model);
  const hasExplorerPane = workspaceHasExplorerPane(model);
  const showExplorerPanel = hasExplorerPane && (treeOpen || sidebarMode === "search");

  const openEngineBundleTab = useCallback(
    (path: string) => {
      const tabNode = model.getActiveTabset()?.getSelectedNode();
      if (!tabNode || tabNode.getType() !== "tab") return;
      const nodeId = tabNode.getId();
      getEngineBundleUrl(workspaceTabId, path)
        .then((result) => {
          if (!result.ok) {
            logError(`Open as App failed for "${path}": ${result.error ?? "unknown error"}`);
            return;
          }
          return addTabToGroup(model, nodeId, "browser", { url: result.url }).then((id) => {
            if (id) useWorkspaceStore.getState().setActivePaneTab(workspaceTabId, nodeId, id);
            onNotifyChanged();
          });
        })
        .catch((err) => logError(`Open as App failed for "${path}"`, err?.stack));
      const title = path.split("/").pop() || path;
      registerProjectApp(workspaceTabId, "engine-bundle", path, title).catch(console.error);
    },
    [workspaceTabId, model, onNotifyChanged],
  );

  const onTreeExportGodotWeb = useCallback(
    (path: string) => {
      exportGodotWeb(workspaceTabId, path)
        .then((result) => {
          if (result.ok && result.outputRel) {
            openEngineBundleTab(result.outputRel);
          } else {
            logError(`Godot Web export failed for "${path}": ${result.error ?? "unknown error"}`);
          }
        })
        .catch((err) => logError(`Godot Web export failed for "${path}"`, err?.stack));
    },
    [workspaceTabId, openEngineBundleTab],
  );

  const onTreeOpenWorldEngineProject = useCallback(
    (path: string) => {
      launchWorldEngine(workspaceTabId, path)
        .then((result) => {
          if (!result.ok) {
            logError(`World Engine launch failed for "${path}": ${result.error ?? "unknown error"}`);
          }
        })
        .catch((err) => logError(`World Engine launch failed for "${path}"`, err?.stack));
    },
    [workspaceTabId],
  );

  const onPathRenamed = useCallback(
    (from: string, to: string) => {
      renamePathInAllPanes(model, from, to, onNotifyChanged);
    },
    [model, onNotifyChanged],
  );

  const onPathDeleted = useCallback(
    (path: string) => {
      deletePathInAllPanes(model, path, onNotifyChanged);
    },
    [model, onNotifyChanged],
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "f") return;
      if (!workspaceTabVisible || !hasExplorerPane) return;
      if (!focusHostRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      setSidebarMode("search");
      setTreeOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspaceTabVisible, hasExplorerPane, setSidebarMode, setTreeOpen, focusHostRef]);

  useEffect(() => {
    const unsub = useWorkspaceStore.subscribe(
      (s) => s.activePaneTabByKey,
      () => forceUpdate(),
    );
    return unsub;
  }, []);

  return (
    <>
      <div className="workspace-explorer-host">
        <div
          ref={explorerScrollRef}
          className="scroll-region obsidian-explorer"
          style={{
            width: treeWidth,
            display: showExplorerPanel ? undefined : "none",
          }}
        >
          <div className={sidebarMode === "search" ? "explorer-sidebar-panel" : "explorer-sidebar-panel hidden"}>
            <SearchPanel
              tabId={workspaceTabId}
              onJumpToResult={(path, kind, line) => bridge?.openOrSwitchToFile(path, kind, line)}
              onClose={() => setSidebarMode("explorer")}
            />
          </div>
          <div className={sidebarMode === "explorer" ? "explorer-sidebar-panel" : "explorer-sidebar-panel hidden"}>
            <TreeView
              tabId={workspaceTabId}
              rootPath={rootPath}
              explorerStateKey={workspaceTabKey(workspaceTabId)}
              scrollContainerRef={explorerScrollRef}
              paneHostRef={focusHostRef}
              selectedPath={bridge?.filePath ?? null}
              paneVisible={workspaceTabVisible}
              explorerModeActive={sidebarMode === "explorer"}
              onOpenFile={(path, kind, pin) => bridge?.openOrSwitchToFile(path, kind, undefined, pin)}
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
  );
}
