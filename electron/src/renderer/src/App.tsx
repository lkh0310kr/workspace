import { useWorkspace } from "./components/useWorkspace";
import { AppSettingsDialog } from "./components/AppSettingsDialog";
import { AppTitlebar } from "./components/AppTitlebar";
import { ClaudeUsageStatusBar } from "./components/ClaudeUsageStatusBar";
import { ErrorLogPanel } from "./components/ErrorLogPanel";
import { InteractionDebugPanel } from "./components/InteractionDebugPanel";
import { LayoutTabDropOverlay } from "./components/LayoutTabDropOverlay";
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
import { useEffect, useCallback } from "react";
import "flexlayout-react/style/combined.css";
import "./assets/styles.css";

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
      <ClaudeUsageStatusBar />
      <LayoutTabDropOverlay />
      <ErrorLogPanel />
      <InteractionDebugPanel />
    </div>
  );
}
