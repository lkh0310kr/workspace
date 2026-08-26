import { useCallback, useEffect, useRef, useState } from "react";
import { Layout, Model, TabNode, Actions } from "flexlayout-react";
import "flexlayout-react/style/combined.css";
import "./assets/styles.css";
import { WorkspaceTabRail } from "./components/WorkspaceTabRail";
import { SidebarQuickSwitchPopover } from "./components/SidebarQuickSwitchPopover";
import { ClaudeUsageStatusBar } from "./components/ClaudeUsageStatusBar";
import { SettingsDialog } from "./components/SettingsDialog";
import { AppSettingsDialog } from "./components/AppSettingsDialog";
import { ErrorLogPanel } from "./components/ErrorLogPanel";
import { LayoutTabDropOverlay } from "./components/LayoutTabDropOverlay";
import { useWorkspace } from "./components/useWorkspace";
import { closeActivePaneTab } from "./layout/layoutActions";
import { setActiveLayoutTab, redrawAllLayouts } from "./layout/layoutRef";
import { countLayoutTabs } from "./layout/layoutModelParse";
import { PaneGroupConfig } from "./layout/paneTypes";
import { installBrowserDownloadRelay } from "./browserDownloads";
import { browserCleanupAll } from "./browser";
import { installBrowserEmbedSupport, reloadFocusedBrowser } from "./browser/browserEmbedSupport";
import { dismissWorkspacePortals } from "./workspacePortalDismiss";
import { interactionCoordinator } from "./interaction/InteractionCoordinator";
import { InteractionDebugPanel } from "./components/InteractionDebugPanel";
import { resolveVisibleWorkspaceTabId } from "./interaction/resolveVisibleWorkspaceTabId";
import { useWorkspaceStore } from "./store/workspaceStore";
import { onBrowserReloadShortcut, onClosePaneTabShortcut, onOpenSettingsShortcut } from "./electron";
import { ThemePreference, applyThemePreference, getStoredThemePreference, setStoredThemePreference } from "./theme";
import { installGlobalErrorLogging } from "./errorLog";
import { isDevInstrumentation } from "./debug/devTools";
import { installInteractionDebugProbe } from "./interaction/interactionDebugProbe";
import { useLayoutHostCallbacks } from "./hooks/useLayoutHostCallbacks";
import { useSplitterDragOverlay } from "./hooks/useSplitterDragOverlay";
import { useTabChipWindowDrop } from "./hooks/useTabChipWindowDrop";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

function zoomActivePane(model: Model, delta: number) {
  const tabset = model.getActiveTabset();
  const tabNode = tabset?.getSelectedNode();
  if (!tabNode || tabNode.getType() !== "tab") return;
  const config = ((tabNode as TabNode).getConfig() ?? {}) as PaneGroupConfig;
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (config.zoom ?? 1) + delta));
  if (nextZoom === (config.zoom ?? 1)) return;
  model.doAction(
    Actions.updateNodeAttributes(tabNode.getId(), { config: { ...config, zoom: nextZoom } }),
  );
}

export default function App() {
  const workspace = useWorkspace();
  const modelEpoch = useWorkspaceStore((s) => s.modelEpoch);
  const storeGetModel = useWorkspaceStore((s) => s.getModel);
  const {
    bumpLayout,
    ensureTerminal,
    makeFactory,
    makeOnAction,
    makeOnModelChange,
    makeOnRenderTabSet,
    getLayoutRefCallback,
  } = useLayoutHostCallbacks();

  const [settingsTarget, setSettingsTarget] = useState<{ tabId: number; anchorRect: DOMRect } | null>(null);
  const [appSettingsAnchor, setAppSettingsAnchor] = useState<DOMRect | null>(null);
  const appSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [railOpen, setRailOpen] = useState(true);
  const [sidebarQuickSwitchAnchor, setSidebarQuickSwitchAnchor] = useState<DOMRect | null>(null);
  const sidebarHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSidebarHoverTimer = useCallback(() => {
    if (sidebarHoverTimerRef.current) {
      clearTimeout(sidebarHoverTimerRef.current);
      sidebarHoverTimerRef.current = null;
    }
  }, []);
  const scheduleSidebarQuickSwitchClose = useCallback(() => {
    clearSidebarHoverTimer();
    sidebarHoverTimerRef.current = setTimeout(() => setSidebarQuickSwitchAnchor(null), 200);
  }, [clearSidebarHoverTimer]);

  const activeTabId = workspace?.active_tab_id ?? 0;
  const visibleWorkspaceTabId = resolveVisibleWorkspaceTabId(
    activeTabId,
    interactionCoordinator.getSnapshot().activeWorkspaceTabId,
    workspace?.tabs,
  );
  const activeModel = storeGetModel(activeTabId);

  useSplitterDragOverlay();
  useTabChipWindowDrop(activeTabId);

  useEffect(() => applyThemePreference(themePreference), [themePreference]);

  const handleThemeChange = useCallback((preference: ThemePreference) => {
    setStoredThemePreference(preference);
    setThemePreference(preference);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setAppSettingsAnchor((open) =>
          open ? null : (appSettingsButtonRef.current?.getBoundingClientRect() ?? null),
        );
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(
    () =>
      onOpenSettingsShortcut(() => {
        setAppSettingsAnchor((open) =>
          open ? null : (appSettingsButtonRef.current?.getBoundingClientRect() ?? null),
        );
      }),
    [],
  );

  useEffect(() => {
    void browserCleanupAll().catch(console.error);
  }, []);

  useEffect(() => installGlobalErrorLogging(), []);
  useEffect(() => {
    if (!isDevInstrumentation) return;
    return installInteractionDebugProbe();
  }, []);
  useEffect(() => installBrowserEmbedSupport(), []);
  useEffect(() => installBrowserDownloadRelay(), []);

  useEffect(() => onBrowserReloadShortcut(({ hard }) => reloadFocusedBrowser(hard)), []);

  useEffect(
    () =>
      onClosePaneTabShortcut(() => {
        if (appSettingsAnchor) {
          setAppSettingsAnchor(null);
          return;
        }
        if (settingsTarget) {
          setSettingsTarget(null);
          return;
        }
        if (sidebarQuickSwitchAnchor) {
          setSidebarQuickSwitchAnchor(null);
          return;
        }
        const model = storeGetModel(activeTabId);
        if (!model) return;
        if (closeActivePaneTab(model)) bumpLayout(activeTabId);
      }),
    [activeTabId, bumpLayout, appSettingsAnchor, settingsTarget, sidebarQuickSwitchAnchor, storeGetModel],
  );

  useEffect(() => {
    setAppSettingsAnchor(null);
    setSettingsTarget(null);
    setSidebarQuickSwitchAnchor(null);
    dismissWorkspacePortals();
  }, [activeTabId]);

  useEffect(() => {
    setActiveLayoutTab(activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    const onResize = () => redrawAllLayouts();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "=" && e.key !== "+" && e.key !== "-" && e.key !== "_") return;
      const model = storeGetModel(activeTabId);
      if (!model) return;
      e.preventDefault();
      const grow = e.key === "=" || e.key === "+";
      zoomActivePane(model, grow ? ZOOM_STEP : -ZOOM_STEP);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId, storeGetModel]);

  useEffect(() => {
    const models = useWorkspaceStore.getState();
    for (const tab of workspace?.tabs ?? []) {
      const model = models.getModel(tab.id);
      if (!model || countLayoutTabs(model) > 0) continue;
      let tabSetId: string | undefined;
      model.visitNodes((node) => {
        if (!tabSetId && node.getType() === "tabset") {
          tabSetId = node.getId();
        }
      });
      if (tabSetId) {
        void ensureTerminal(tab.id, model, tabSetId);
      }
    }
  }, [modelEpoch, ensureTerminal, workspace?.tabs]);

  if (!workspace || !activeModel) {
    return <div className="loading">Loading workspace…</div>;
  }

  return (
    <div className="app-root">
      <div className="titlebar">
        <button
          type="button"
          className={`titlebar-sidebar-toggle${railOpen ? " active" : ""}`}
          title="Toggle Sidebar"
          onClick={() => {
            setRailOpen((open) => !open);
            clearSidebarHoverTimer();
            setSidebarQuickSwitchAnchor(null);
          }}
          onMouseEnter={(e) => {
            if (railOpen) return;
            const rect = e.currentTarget.getBoundingClientRect();
            clearSidebarHoverTimer();
            sidebarHoverTimerRef.current = setTimeout(() => setSidebarQuickSwitchAnchor(rect), 350);
          }}
          onMouseLeave={scheduleSidebarQuickSwitchClose}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
          </svg>
        </button>
        <button
          ref={appSettingsButtonRef}
          type="button"
          className={`titlebar-sidebar-toggle${appSettingsAnchor ? " active" : ""}`}
          title="Settings (⌘,)"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setAppSettingsAnchor((open) => (open ? null : rect));
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
            />
            <path
              fill="none"
              stroke="currentColor"
              d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.4 3.6l-1.13 1.13M4.73 11.27 3.6 12.4M12.4 12.4l-1.13-1.13M4.73 4.73 3.6 3.6"
            />
          </svg>
        </button>
        {sidebarQuickSwitchAnchor && !railOpen && (
          <SidebarQuickSwitchPopover
            tabs={workspace.tabs}
            activeTabId={workspace.active_tab_id}
            anchorRect={sidebarQuickSwitchAnchor}
            onClose={() => setSidebarQuickSwitchAnchor(null)}
            onMouseEnter={clearSidebarHoverTimer}
            onMouseLeave={scheduleSidebarQuickSwitchClose}
          />
        )}
      </div>
      <div className="app-shell">
        {railOpen && (
          <WorkspaceTabRail
            tabs={workspace.tabs}
            activeTabId={visibleWorkspaceTabId}
            onOpenSettings={(tabId, anchorRect) => setSettingsTarget({ tabId, anchorRect })}
          />
        )}
        <div className="layout-host">
          {workspace.tabs.map((tab) => {
            const model = storeGetModel(tab.id);
            if (!model) return null;
            const active = tab.id === visibleWorkspaceTabId;
            return (
              <div
                key={tab.id}
                className={`layout-host-item${active ? " layout-host-item--active" : ""}`}
                data-workspace-tab-id={tab.id}
                style={{
                  visibility: active ? "visible" : "hidden",
                  pointerEvents: active ? "auto" : "none",
                }}
              >
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
            );
          })}
        </div>
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
