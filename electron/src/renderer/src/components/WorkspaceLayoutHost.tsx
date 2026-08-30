import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout, type Model } from "flexlayout-react";
import type { TabInfo } from "../electron";
import { workspaceTabHostStyle } from "../interaction/embedPolicy";
import type { useLayoutHostCallbacks } from "../hooks/useLayoutHostCallbacks";
import {
  getStoredSidebarMode,
  getStoredTreeOpen,
  getStoredTreeWidth,
  migrateLegacySidebarToWorkspaceTab,
  setStoredSidebarMode,
  setStoredTreeOpen,
  setStoredTreeWidth,
  type SidebarMode,
} from "../explorer/explorerSidebarChrome";
import { workspaceTabKey } from "../explorer/workspaceTabKey";
import { WorkspaceExplorerProvider } from "../explorer/WorkspaceExplorerContext";
import { WorkspaceExplorerSidebar } from "./WorkspaceExplorerSidebar";
import { paneTabStoreKey } from "../store/paneTabKey";
import { getActivePaneTabNode } from "../explorer/workspaceExplorerBridge";

type LayoutCallbacks = ReturnType<typeof useLayoutHostCallbacks>;

type Props = {
  tabs: TabInfo[];
  visibleWorkspaceTabId: number;
  getModel: (tabId: number) => Model | undefined;
  onExplorerLayoutChanged: (tabId: number) => void;
} & Pick<
  LayoutCallbacks,
  "makeFactory" | "makeOnAction" | "makeOnModelChange" | "makeOnRenderTabSet" | "getLayoutRefCallback"
>;

function useWorkspaceExplorerChromeState(workspaceTabId: number, model: Model | undefined) {
  const tabKey = workspaceTabKey(workspaceTabId);
  const [treeOpen, setTreeOpenState] = useState(() => getStoredTreeOpen(tabKey));
  const [treeWidth, setTreeWidthState] = useState(() => getStoredTreeWidth(tabKey));
  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>(() => getStoredSidebarMode(tabKey));

  useEffect(() => {
    if (!model) return;
    const activeNode = getActivePaneTabNode(model);
    if (!activeNode) return;
    const paneKey = paneTabStoreKey(workspaceTabId, activeNode.getId());
    migrateLegacySidebarToWorkspaceTab(workspaceTabId, paneKey);
    const config = activeNode.getConfig() as { activeTabId?: string } | undefined;
    if (config?.activeTabId) {
      migrateLegacySidebarToWorkspaceTab(workspaceTabId, config.activeTabId);
    }
  }, [workspaceTabId, model]);

  const setTreeOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setTreeOpenState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        setStoredTreeOpen(tabKey, value);
        return value;
      });
    },
    [tabKey],
  );

  const setTreeWidth = useCallback(
    (next: number | ((prev: number) => number)) => {
      setTreeWidthState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        setStoredTreeWidth(tabKey, value);
        return value;
      });
    },
    [tabKey],
  );

  const setSidebarMode = useCallback(
    (mode: SidebarMode) => {
      setStoredSidebarMode(tabKey, mode);
      setSidebarModeState(mode);
    },
    [tabKey],
  );

  return useMemo(
    () => ({ treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode }),
    [treeOpen, treeWidth, sidebarMode, setTreeOpen, setTreeWidth, setSidebarMode],
  );
}

export function WorkspaceLayoutHost({
  tabs,
  visibleWorkspaceTabId,
  getModel,
  onExplorerLayoutChanged,
  makeFactory,
  makeOnAction,
  makeOnModelChange,
  makeOnRenderTabSet,
  getLayoutRefCallback,
}: Props) {
  return (
    <div className="layout-host">
      {tabs.map((tab) => {
        const model = getModel(tab.id);
        if (!model) return null;
        const active = tab.id === visibleWorkspaceTabId;
        return (
          <WorkspaceTabLayoutItem
            key={tab.id}
            tab={tab}
            model={model}
            active={active}
            onExplorerLayoutChanged={() => onExplorerLayoutChanged(tab.id)}
            makeFactory={makeFactory}
            makeOnAction={makeOnAction}
            makeOnModelChange={makeOnModelChange}
            makeOnRenderTabSet={makeOnRenderTabSet}
            getLayoutRefCallback={getLayoutRefCallback}
          />
        );
      })}
    </div>
  );
}

function WorkspaceTabLayoutItem({
  tab,
  model,
  active,
  onExplorerLayoutChanged,
  makeFactory,
  makeOnAction,
  makeOnModelChange,
  makeOnRenderTabSet,
  getLayoutRefCallback,
}: {
  tab: TabInfo;
  model: Model;
  active: boolean;
  onExplorerLayoutChanged: () => void;
} & Pick<
  Props,
  "makeFactory" | "makeOnAction" | "makeOnModelChange" | "makeOnRenderTabSet" | "getLayoutRefCallback"
>) {
  const explorerChrome = useWorkspaceExplorerChromeState(tab.id, model);
  const shellRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={`layout-host-item${active ? " layout-host-item--active" : ""}`}
      data-workspace-tab-id={tab.id}
      style={workspaceTabHostStyle(active)}
    >
      <WorkspaceExplorerProvider value={explorerChrome}>
        <div ref={shellRef} className="workspace-tab-shell">
          <WorkspaceExplorerSidebar
            workspaceTabId={tab.id}
            rootPath={tab.root_path}
            model={model}
            workspaceTabVisible={active}
            focusHostRef={shellRef}
            onNotifyChanged={onExplorerLayoutChanged}
          />
          <div className="workspace-tab-layout">
            <Layout
              ref={getLayoutRefCallback(tab.id)}
              model={model}
              factory={makeFactory(tab.id)}
              onRenderTabSet={makeOnRenderTabSet(tab.id)}
              onAction={makeOnAction(tab.id)}
              onModelChange={makeOnModelChange(tab.id)}
              realtimeResize
              tabDragSpeed={0}
            />
          </div>
        </div>
      </WorkspaceExplorerProvider>
    </div>
  );
}
