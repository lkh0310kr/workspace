import { useWorkspace } from "./components/useWorkspace";
import { AppSettingsDialog } from "./components/AppSettingsDialog";
import { AppTitlebar } from "./components/AppTitlebar";
import { AgentUsageStatusBar } from "./components/AgentUsageStatusBar";
import { loadUsageMeterSettings, onHomeShortcut, onQuickOpenShortcut, saveUsageMeterSettings } from "./electron";
import { DEFAULT_USAGE_METER_SETTINGS, type UsageMeterSettings } from "../../shared/usage-meter-settings";
import { ErrorLogPanel } from "./components/ErrorLogPanel";
import { InteractionDebugPanel } from "./components/InteractionDebugPanel";
import { LayoutTabDropOverlay } from "./components/LayoutTabDropOverlay";
import { LoadingWorkspace } from "./components/LoadingWorkspace";
import { QuickOpen } from "./components/QuickOpen";
import { SettingsDialog } from "./components/SettingsDialog";
import { WorkspaceLayoutHost } from "./components/WorkspaceLayoutHost";
import { DashboardView } from "./dashboard/DashboardView";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useAppShellState } from "./hooks/useAppShellState";
import { useAppShortcuts, useDismissPortalsOnWorkspaceSwitch } from "./hooks/useAppShortcuts";
import { useShortcutDispatcher } from "./shortcuts/useShortcutDispatcher";
import { useLayoutHostCallbacks } from "./hooks/useLayoutHostCallbacks";
import { useLayoutRevisions } from "./hooks/useLayoutRevision";
import { useEnsureDefaultTerminals, useLayoutHostLifecycle } from "./hooks/useLayoutHostLifecycle";
import { useSplitterDragOverlay } from "./hooks/useSplitterDragOverlay";
import { useTabChipWindowDrop } from "./hooks/useTabChipWindowDrop";
import { useWorkspaceTabHotkeys } from "./hooks/useWorkspaceTabHotkeys";
import { useVisibleWorkspaceTab } from "./hooks/useVisibleWorkspaceTab";
import { useWorkspaceScope } from "./interaction/useWorkspaceScope";
import { switchToHome } from "./workspaceNavigation";
import { useHtmlFullscreen } from "./hooks/useHtmlFullscreen";
import { applyThemePreference, setStoredThemePreference } from "./theme";
import { useWorkspaceStore } from "./store/workspaceStore";
import type { Model, TabNode } from "flexlayout-react";
import { readPaneGroupConfig } from "./layout/layoutSession";
import { openFileInPaneGroup, setActiveTabInGroup } from "./layout/layoutActions";
import { useEffect, useCallback, useState } from "react";
import { syncAgentPaneRegistryFromLayouts } from "./terminal/syncAgentPaneRegistryFromLayouts";
import "flexlayout-react/style/combined.css";
import "./assets/styles.css";

if (typeof document !== "undefined" && window.api?.platform) {
  document.documentElement.dataset.platform = window.api.platform;
  if (window.api.isWsl) document.documentElement.dataset.wsl = "1";
}

// Cmd+P's "open in the active pane" — mirrors PaneGroup's openOrSwitchToFile,
// but called from Quick Open (not scoped to one PaneGroup instance).
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
  const config = readPaneGroupConfig(tabNode as TabNode);
  const existing = config.tabs.find((t) => t.filePath === path);
  if (existing) {
    setActiveTabInGroup(model, nodeId, existing.id);
    bumpLayout(workspaceTabId);
    return;
  }
  const id = await openFileInPaneGroup(model, nodeId, path, kind);
  if (!id) return;
  setActiveTabInGroup(model, nodeId, id);
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
    toggleAppSettings,
    dismissPortals,
  } = shell;

  const activeTabId = workspace?.active_tab_id ?? 0;
  const { homeActive } = useWorkspaceScope();
  const visibleWorkspaceTabId = useVisibleWorkspaceTab();
  const activeModel = storeGetModel(activeTabId);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [usageMeterSettings, setUsageMeterSettings] = useState<UsageMeterSettings>(
    DEFAULT_USAGE_METER_SETTINGS,
  );

  useEffect(() => {
    loadUsageMeterSettings()
      .then(setUsageMeterSettings)
      .catch(() => {});
  }, []);

  const handleUsageMeterSettingsChange = useCallback((next: UsageMeterSettings) => {
    setUsageMeterSettings(next);
    void saveUsageMeterSettings(next);
  }, []);
  const htmlFullscreen = useHtmlFullscreen();

  useAppBootstrap();
  useShortcutDispatcher();
  useSplitterDragOverlay();
  useTabChipWindowDrop(activeTabId);
  useLayoutHostLifecycle(activeTabId);
  useEnsureDefaultTerminals(workspace?.tabs, layoutRevisions, ensureTerminal);
  useWorkspaceTabHotkeys(workspace?.tabs ?? []);
  useDismissPortalsOnWorkspaceSwitch(activeTabId, dismissPortals);
  useAppShortcuts({
    activeTabId,
    getModel: storeGetModel,
    bumpLayout,
    appSettingsOpen: appSettingsAnchor !== null,
    settingsTarget,
    dismissShellPortals: dismissPortals,
  });

  useEffect(() => applyThemePreference(themePreference), [themePreference]);

  useEffect(() => {
    if (!workspace?.tabs) return;
    syncAgentPaneRegistryFromLayouts(workspace.tabs, storeGetModel);
  }, [workspace?.tabs, layoutRevisions, storeGetModel]);

  useEffect(() => {
    const offHome = onHomeShortcut(() => switchToHome());
    const offQuickOpen = onQuickOpenShortcut(() => setQuickOpenOpen(true));
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      if (e.key.toLowerCase() !== "p") return;
      e.preventDefault();
      setQuickOpenOpen(true);
    }
    // Run before editor keymaps and embedded surfaces can consume the event.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      offHome();
      offQuickOpen();
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const handleThemeChange = useCallback(
    (preference: typeof themePreference) => {
      setStoredThemePreference(preference);
      setThemePreference(preference);
    },
    [setThemePreference],
  );

  if (!workspace || !activeModel) {
    return <LoadingWorkspace />;
  }

  return (
    <div className={`app-root${htmlFullscreen ? " html-fullscreen" : ""}`}>
      <AppTitlebar
        appSettingsOpen={appSettingsAnchor !== null}
        appSettingsButtonRef={appSettingsButtonRef}
        onToggleAppSettings={(anchor) => toggleAppSettings(anchor)}
        workspaceTabs={workspace.tabs}
        activeWorkspaceTabId={visibleWorkspaceTabId}
        homeActive={homeActive}
        onOpenWorkspaceTabSettings={(tabId, anchorRect) => setSettingsTarget({ tabId, anchorRect })}
        getModel={storeGetModel}
        layoutRevisions={layoutRevisions}
      />
      <div className="app-shell">
        {homeActive ? <DashboardView tabs={workspace.tabs} /> : null}
        <WorkspaceLayoutHost
          tabs={workspace.tabs}
          visibleWorkspaceTabId={visibleWorkspaceTabId}
          homeActive={homeActive}
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
            usageMeterSettings={usageMeterSettings}
            onUsageMeterSettingsChange={handleUsageMeterSettingsChange}
          />
        )}
      </div>
      {quickOpenOpen && !homeActive && (
        <QuickOpen
          tabId={visibleWorkspaceTabId}
          onOpenFile={(path, kind) => {
            const model = storeGetModel(visibleWorkspaceTabId);
            if (model) void openFileInActivePane(model, visibleWorkspaceTabId, path, kind, bumpLayout);
          }}
          onClose={() => setQuickOpenOpen(false)}
        />
      )}
      <AgentUsageStatusBar
        meterSettings={usageMeterSettings}
        onMeterSettingsChange={handleUsageMeterSettingsChange}
        onOpenAppSettings={() => toggleAppSettings()}
      />
      <LayoutTabDropOverlay />
      <ErrorLogPanel />
      <InteractionDebugPanel />
    </div>
  );
}
