import { useWorkspace } from "./components/useWorkspace";
import { AppSettingsDialog } from "./components/AppSettingsDialog";
import { AppTitlebar } from "./components/AppTitlebar";
import { ClaudeUsageStatusBar } from "./components/ClaudeUsageStatusBar";
import { ErrorLogPanel } from "./components/ErrorLogPanel";
import { InteractionDebugPanel } from "./components/InteractionDebugPanel";
import { LayoutTabDropOverlay } from "./components/LayoutTabDropOverlay";
import { QuickOpen } from "./components/QuickOpen";
import { SettingsDialog } from "./components/SettingsDialog";
import { WorkspaceLayoutHost } from "./components/WorkspaceLayoutHost";
import { WorkspaceTabRail } from "./components/WorkspaceTabRail";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useAppShellState } from "./hooks/useAppShellState";
import { useAppShortcuts, useDismissPortalsOnWorkspaceSwitch } from "./hooks/useAppShortcuts";
import { useLayoutHostCallbacks } from "./hooks/useLayoutHostCallbacks";
import { useLayoutRevisions } from "./hooks/useLayoutRevision";
import { useEnsureDefaultTerminals, useLayoutHostLifecycle } from "./hooks/useLayoutHostLifecycle";
import { useSplitterDragOverlay } from "./hooks/useSplitterDragOverlay";
import { useTabChipWindowDrop } from "./hooks/useTabChipWindowDrop";
import { useVisibleWorkspaceTab } from "./hooks/useVisibleWorkspaceTab";
import { applyThemePreference, setStoredThemePreference } from "./theme";
import { useWorkspaceStore } from "./store/workspaceStore";
import { addTabToGroup } from "./layout/layoutActions";
import type { PaneGroupConfig } from "./layout/paneTypes";
import type { Model, TabNode } from "flexlayout-react";
import { useEffect, useCallback, useState } from "react";
import "flexlayout-react/style/combined.css";
import "./assets/styles.css";

// Cmd+P's "open in the active pane" — mirrors PaneGroup.tsx's own
// openOrSwitchToFile, but called from outside any one PaneGroup instance
// (Quick Open isn't scoped to a pane), so it looks up the active tabset's
// selected tab node the same way useAppShortcuts.ts's zoomActivePane does.
// Only pushes the store's activePaneTabByKey for an existing-tab match —
// the target PaneGroup's own effect (watching localActiveId) reactively
// syncs that into the flexlayout model and persists it, same as a normal
// in-pane tab click; no need to duplicate that here.
async function openFileInActivePane(
  model: Model,
  workspaceTabId: number,
  path: string,
  kind: "code" | "markdown" | "viewer",
  bumpLayout: (tabId: number) => void,
): Promise<void> {
  const tabset = model.getActiveTabset();
  const tabNode = tabset?.getSelectedNode();
  if (!tabNode || tabNode.getType() !== "tab") return;
  const nodeId = tabNode.getId();
  const config = ((tabNode as TabNode).getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
  const existing = config.tabs.find((t) => t.filePath === path);
  if (existing) {
    useWorkspaceStore.getState().setActivePaneTab(workspaceTabId, nodeId, existing.id);
    return;
  }
  const id = await addTabToGroup(model, nodeId, kind, { filePath: path });
  if (!id) return;
  useWorkspaceStore.getState().setActivePaneTab(workspaceTabId, nodeId, id);
  bumpLayout(workspaceTabId);
}

export default function App() {
  const workspace = useWorkspace();
  const layoutRevisions = useLayoutRevisions();
  const storeGetModel = useWorkspaceStore((s) => s.getModel);
  const layoutCallbacks = useLayoutHostCallbacks();
  const { bumpLayout, ensureTerminal } = layoutCallbacks;

  const shell = useAppShellState();
  const {
    settingsTarget,
    setSettingsTarget,
    appSettingsAnchor,
    setAppSettingsAnchor,
    appSettingsButtonRef,
    themePreference,
    setThemePreference,
    railOpen,
    setRailOpen,
    sidebarQuickSwitchAnchor,
    setSidebarQuickSwitchAnchor,
    sidebarHoverTimerRef,
    clearSidebarHoverTimer,
    scheduleSidebarQuickSwitchClose,
    toggleAppSettings,
    dismissPortals,
  } = shell;

  const activeTabId = workspace?.active_tab_id ?? 0;
  const visibleWorkspaceTabId = useVisibleWorkspaceTab();
  const activeModel = storeGetModel(activeTabId);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);

  useAppBootstrap();
  useSplitterDragOverlay();
  useTabChipWindowDrop(activeTabId);
  useLayoutHostLifecycle(activeTabId);
  useEnsureDefaultTerminals(workspace?.tabs, layoutRevisions, ensureTerminal);
  useDismissPortalsOnWorkspaceSwitch(activeTabId, dismissPortals);
  useAppShortcuts({
    activeTabId,
    getModel: storeGetModel,
    bumpLayout,
    appSettingsOpen: appSettingsAnchor !== null,
    settingsTarget,
    sidebarQuickSwitchOpen: sidebarQuickSwitchAnchor !== null,
    dismissShellPortals: dismissPortals,
    setSidebarQuickSwitchAnchor,
  });

  useEffect(() => applyThemePreference(themePreference), [themePreference]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      if (e.key.toLowerCase() !== "p") return;
      e.preventDefault();
      setQuickOpenOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleThemeChange = useCallback(
    (preference: typeof themePreference) => {
      setStoredThemePreference(preference);
      setThemePreference(preference);
    },
    [setThemePreference],
  );

  const handleToggleRail = useCallback(() => {
    setRailOpen((open) => !open);
    clearSidebarHoverTimer();
    setSidebarQuickSwitchAnchor(null);
  }, [clearSidebarHoverTimer, setRailOpen, setSidebarQuickSwitchAnchor]);

  const handleSidebarHoverEnter = useCallback(
    (anchor: DOMRect) => {
      clearSidebarHoverTimer();
      sidebarHoverTimerRef.current = setTimeout(() => setSidebarQuickSwitchAnchor(anchor), 350);
    },
    [clearSidebarHoverTimer, setSidebarQuickSwitchAnchor, sidebarHoverTimerRef],
  );

  if (!workspace || !activeModel) {
    return <div className="loading">Loading workspace…</div>;
  }

  return (
    <div className="app-root">
      <AppTitlebar
        railOpen={railOpen}
        onToggleRail={handleToggleRail}
        appSettingsOpen={appSettingsAnchor !== null}
        appSettingsButtonRef={appSettingsButtonRef}
        onToggleAppSettings={(anchor) => toggleAppSettings(anchor)}
        tabs={workspace.tabs}
        activeTabId={workspace.active_tab_id}
        sidebarQuickSwitchAnchor={sidebarQuickSwitchAnchor}
        onCloseQuickSwitch={() => setSidebarQuickSwitchAnchor(null)}
        onSidebarHoverEnter={handleSidebarHoverEnter}
        onSidebarHoverLeave={scheduleSidebarQuickSwitchClose}
        clearSidebarHoverTimer={clearSidebarHoverTimer}
      />
      <div className="app-shell">
        {railOpen && (
          <WorkspaceTabRail
            tabs={workspace.tabs}
            activeTabId={visibleWorkspaceTabId}
            onOpenSettings={(tabId, anchorRect) => setSettingsTarget({ tabId, anchorRect })}
          />
        )}
        <WorkspaceLayoutHost
          tabs={workspace.tabs}
          visibleWorkspaceTabId={visibleWorkspaceTabId}
          getModel={storeGetModel}
          {...layoutCallbacks}
        />
        {settingsTarget && (
          <SettingsDialog
            anchorRect={settingsTarget.anchorRect}
            onClose={() => setSettingsTarget(null)}
            tabId={settingsTarget.tabId}
            tabTitle={workspace.tabs.find((t) => t.id === settingsTarget.tabId)?.title ?? ""}
            rootPath={workspace.tabs.find((t) => t.id === settingsTarget.tabId)?.root_path ?? ""}
          />
        )}
        {appSettingsAnchor && (
          <AppSettingsDialog
            anchorRect={appSettingsAnchor}
            onClose={() => setAppSettingsAnchor(null)}
            themePreference={themePreference}
            onThemeChange={handleThemeChange}
          />
        )}
      </div>
      {quickOpenOpen && (
        <QuickOpen
          tabId={visibleWorkspaceTabId}
          onOpenFile={(path, kind) => {
            const model = storeGetModel(visibleWorkspaceTabId);
            if (model) void openFileInActivePane(model, visibleWorkspaceTabId, path, kind, bumpLayout);
          }}
          onClose={() => setQuickOpenOpen(false)}
        />
      )}
      <ClaudeUsageStatusBar />
      <LayoutTabDropOverlay />
      <ErrorLogPanel />
      <InteractionDebugPanel />
    </div>
  );
}
