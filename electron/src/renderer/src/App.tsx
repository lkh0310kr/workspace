import { useCallback, useEffect, useRef, useState } from "react";
import { Layout, Model, TabNode, Actions, type Action } from "flexlayout-react";
import "flexlayout-react/style/combined.css";
import "./assets/styles.css";
import { WorkspaceTabRail } from "./components/WorkspaceTabRail";
import { SidebarQuickSwitchPopover } from "./components/SidebarQuickSwitchPopover";
import { ClaudeUsageStatusBar } from "./components/ClaudeUsageStatusBar";
import { SettingsDialog } from "./components/SettingsDialog";
import { AppSettingsDialog } from "./components/AppSettingsDialog";
import { ErrorLogPanel } from "./components/ErrorLogPanel";
import { PaneErrorBoundary } from "./components/PaneErrorBoundary";
import { useWorkspace } from "./components/useWorkspace";
import { addPaneToTabSet, closeActivePaneTab, moveTabToNewPane } from "./layout/layoutActions";
import { getTabDrag, endTabDrag } from "./layout/tabDrag";
import { setLayoutInstance, setActiveLayoutTab, redrawAllLayouts } from "./layout/layoutRef";
import { countLayoutTabs } from "./layout/layoutModelParse";
import { PaneGroupConfig } from "./layout/paneTypes";
import { PaneGroup } from "./panes/PaneGroup";
import { installBrowserDownloadRelay } from "./browserDownloads";
import { browserCleanupAll } from "./browser";
import { dismissWorkspacePortals } from "./workspacePortalDismiss";
import { popOverlayBlock, pushOverlayBlock } from "./browser/overlayBarrier";
import { interactionCoordinator } from "./interaction/InteractionCoordinator";
import { InteractionDebugPanel } from "./components/InteractionDebugPanel";
import { resolveVisibleWorkspaceTabId } from "./interaction/resolveVisibleWorkspaceTabId";
import { useInteractionCoordinatorActiveTab } from "./interaction/useInteractionCoordinatorActiveTab";
import { useWorkspaceStore } from "./store/workspaceStore";
import { onBrowserReloadShortcut, onClosePaneTabShortcut, onOpenSettingsShortcut } from "./electron";
import { getActiveBrowserWebview, installBrowserFocusTracking, installBrowserGuestFocusRelay } from "./layout/activeBrowserWebview";
import { ThemePreference, applyThemePreference, getStoredThemePreference, setStoredThemePreference } from "./theme";
import { installGlobalErrorLogging } from "./errorLog";
import { installInteractionDebugProbe } from "./interaction/interactionDebugProbe";
import { dbgLog } from "./interaction/interactionDebugLog";

// Port of ui/src/App.tsx (task 6: layout/flexlayout-react + workspace tab
// rail; SettingsDialog/AppSettingsDialog wired back in afterward), later
// reworked to globalize the editor's multi-tab system across every pane
// kind (PaneGroup.tsx) — every flexlayout tab node now holds a
// PaneGroupConfig (a list of heterogeneous terminal/browser/editor tabs)
// instead of a single component+config pair.

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
  const storePersistLayout = useWorkspaceStore((s) => s.persistLayout);
  const storeGetModel = useWorkspaceStore((s) => s.getModel);
  const storeSetPendingRebalance = useWorkspaceStore((s) => s.setPendingRebalance);
  const storeTakePendingRebalance = useWorkspaceStore((s) => s.takePendingRebalance);
  const storeMarkEnsureInflight = useWorkspaceStore((s) => s.markEnsureInflight);
  const storeClearEnsureInflight = useWorkspaceStore((s) => s.clearEnsureInflight);
  const [settingsTarget, setSettingsTarget] = useState<{ tabId: number; anchorRect: DOMRect } | null>(null);
  const [appSettingsAnchor, setAppSettingsAnchor] = useState<DOMRect | null>(null);
  const appSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [railOpen, setRailOpen] = useState(true);
  // Hovering the sidebar toggle while the rail is closed shows a transient
  // popover of workspace tabs to quickly jump to, instead of requiring a
  // click just to see/switch tabs — "Sidebar Toggle 버튼 hover시 popover
  // selector 표시하여 quick selecting". Delayed both ways (open and close)
  // so a mouse just passing over the button doesn't flash it, and moving
  // from the button into the popover itself doesn't close it in the gap.
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

  useEffect(() => {
    return applyThemePreference(themePreference);
  }, [themePreference]);

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

  const activeTabId = workspace?.active_tab_id ?? 0;
  const coordinatorActiveTabId = useInteractionCoordinatorActiveTab();
  // Re-render on coordinator changes; read snapshot directly — hook state can lag
  // one frame behind synchronous setActiveWorkspaceTab (tab close/add).
  const visibleWorkspaceTabId = resolveVisibleWorkspaceTabId(
    activeTabId,
    interactionCoordinator.getSnapshot().activeWorkspaceTabId,
    workspace?.tabs,
  );
  const activeModel = storeGetModel(activeTabId);
  void modelEpoch;

  const bumpLayout = useCallback(
    (tabId: number) => {
      const model = storeGetModel(tabId);
      if (model) storePersistLayout(tabId, model);
    },
    [storeGetModel, storePersistLayout],
  );

  const ensureTerminal = useCallback(
    async (tabId: number, model: Model, tabSetId: string) => {
      if (countLayoutTabs(model) > 0 || !storeMarkEnsureInflight(tabId)) return;
      try {
        if (countLayoutTabs(model) > 0) return;
        await addPaneToTabSet(model, tabSetId, "terminal");
        if (countLayoutTabs(model) > 0) bumpLayout(tabId);
      } finally {
        storeClearEnsureInflight(tabId);
      }
    },
    [bumpLayout, storeMarkEnsureInflight, storeClearEnsureInflight],
  );

  // One factory/onAction/onModelChange per workspace tab (not just the
  // active one) — every tab's <Layout> now stays mounted simultaneously
  // (see the render below), so each needs to operate on *its own* model,
  // not assume "whichever tab happens to be active right now" the way a
  // single shared factory could when only the active tab's Layout ever
  // existed.
  const makeFactory = useCallback(
    (tabId: number) => (node: TabNode) => {
      const rootPath =
        useWorkspaceStore.getState().tabs.find((t) => t.id === tabId)?.root_path ?? "";
      return (
        <PaneErrorBoundary>
          <PaneGroup
            tabNode={node}
            workspaceTabId={tabId}
            rootPath={rootPath}
            visible={tabId === visibleWorkspaceTabId && node.isVisible()}
            onNotifyChanged={() => bumpLayout(tabId)}
          />
        </PaneErrorBoundary>
      );
    },
    [visibleWorkspaceTabId, bumpLayout],
  );

  useEffect(() => {
    void browserCleanupAll().catch(console.error);
  }, []);

  // Surfaces uncaught errors/rejections in the UI (ErrorLogPanel) instead
  // of only the devtools console — flexlayout's own per-tab error
  // boundary already swallows render errors behind a generic "Error
  // rendering component" message with no way to see the real one, and a
  // failed IPC call (e.g. reading a file that doesn't exist) is an
  // unhandled rejection nobody would otherwise notice at all.
  useEffect(() => installGlobalErrorLogging(), []);
  useEffect(() => installInteractionDebugProbe(), []);
  useEffect(() => installBrowserFocusTracking(), []);
  useEffect(() => installBrowserGuestFocusRelay(), []);
  useEffect(() => installBrowserDownloadRelay(), []);

  // Cmd+R/Cmd+Shift+R — main/index.ts intercepts this at the input-event
  // level (a renderer keydown listener wouldn't reliably see it — see the
  // comment there) and forwards it here; reloads whichever browser tab
  // last became visible, if any. No-op with nothing else affected if no
  // browser tab has ever been shown — deliberately doesn't fall back to
  // reloading the whole app.
  useEffect(
    () =>
      onBrowserReloadShortcut(({ hard }) => {
        const webview = getActiveBrowserWebview();
        if (!webview) return;
        if (hard) webview.reloadIgnoringCache();
        else webview.reload();
      }),
    [],
  );

  // Cmd+W — closes the active tab in the focused pane (or an open popover
  // first). Intercepted at the main-process input-event level like Cmd+R.
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
    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".flexlayout__splitter")) return;
      dragging = true;
      pushOverlayBlock("splitter-drag");
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      popOverlayBlock("splitter-drag");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      if (dragging) popOverlayBlock("splitter-drag");
    };
  }, []);

  useEffect(() => {
    setAppSettingsAnchor(null);
    setSettingsTarget(null);
    setSidebarQuickSwitchAnchor(null);
    dismissWorkspacePortals();
    // activeTabId → InteractionCoordinator sync is handled by workspaceStore bridge.
    dbgLog("App.tsx:activeTabId", "effect", { activeTabId }, "phase2");
  }, [activeTabId]);

  useEffect(() => {
    // #region agent log
    dbgLog(
      "App.tsx:visibleWorkspaceTabId",
      "pane visibility source",
      {
        visibleWorkspaceTabId,
        activeTabId,
        coordinatorActiveTabId,
        snapshotTabId: interactionCoordinator.getSnapshot().activeWorkspaceTabId,
      },
      "H16",
      "post-fix",
    );
    // #endregion
  }, [visibleWorkspaceTabId, activeTabId, coordinatorActiveTabId]);

  useEffect(() => {
    setActiveLayoutTab(activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    const onResize = () => redrawAllLayouts();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Fallback for a tab-chip drag (PaneTabStrip.tsx) that ends somewhere
  // that ISN'T over any pane's tab strip: dropping *inside* a tab strip
  // shows the line hint and reorders/merges (handled entirely within
  // PaneTabStrip's own onDrop, which clears the shared drag payload via
  // endTabDrag()); dropping anywhere else should still "do something" —
  // move that tab into its own new pane, matching a real browser/VSCode
  // (drag a tab out and drop it away from any tab strip -> new window/
  // split). Native drop events fire on the deepest element first and
  // bubble up, so by the time this window-level listener runs, getTabDrag()
  // is already null if some PaneTabStrip already consumed the drop.
  useEffect(() => {
    const onDragOver = (e: globalThis.DragEvent) => {
      if (getTabDrag()) e.preventDefault();
    };
    const onDrop = (e: globalThis.DragEvent) => {
      const payload = getTabDrag();
      if (!payload) return;
      e.preventDefault();
      const model = storeGetModel(activeTabId);
      if (model && moveTabToNewPane(model, payload.sourceTabNodeId, payload.tabId)) {
        bumpLayout(activeTabId);
      }
      endTabDrag();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [activeTabId, bumpLayout, storeGetModel]);

  const makeOnAction = useCallback(
    (tabId: number) => (action: Action) => {
      if (action.type !== Actions.MOVE_NODE) return action;
      const model = storeGetModel(tabId);
      if (!model) return action;
      if (action.data.location === "center") {
        let target = model.getNodeById(action.data.toNode);
        if (target?.getType() === "tab") target = target.getParent() ?? undefined;
        const targetTab = target?.getChildren().find((child) => child.getId() !== action.data.fromNode);
        const draggedTab = model.getNodeById(action.data.fromNode);
        if (
          targetTab instanceof TabNode &&
          draggedTab instanceof TabNode &&
          targetTab.getId() !== draggedTab.getId()
        ) {
          const targetAttrs = { component: targetTab.getComponent(), config: targetTab.getConfig() };
          const draggedAttrs = { component: draggedTab.getComponent(), config: draggedTab.getConfig() };
          model.doAction(Actions.updateNodeAttributes(targetTab.getId(), draggedAttrs));
          model.doAction(Actions.updateNodeAttributes(draggedTab.getId(), targetAttrs));
        }
        return undefined;
      } else {
        storeSetPendingRebalance(tabId, action.data.fromNode);
      }
      return action;
    },
    [storeGetModel, storeSetPendingRebalance],
  );

  const makeOnModelChange = useCallback(
    (tabId: number) => () => {
      const model = storeGetModel(tabId);
      if (!model) return;
      const draggedId = storeTakePendingRebalance(tabId);
      if (draggedId) {
        const parent = model.getNodeById(draggedId)?.getParent()?.getParent();
        if (parent) {
          model.doAction(Actions.adjustWeights(parent.getId(), parent.getChildren().map(() => 1)));
        }
      }
      storePersistLayout(tabId, model);
    },
    [storeGetModel, storeTakePendingRebalance, storePersistLayout],
  );

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

  // Every workspace tab's model, not just the active one — every tab's
  // Layout stays mounted simultaneously now (see the render below), so a
  // tab that's empty needs its default terminal added regardless of
  // whether it happens to be the one currently in front.
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
            // Same "capture before the updater runs" fix as
            // PaneTabStrip.tsx's + button — e.currentTarget is null by the
            // time this updater actually executes.
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
          {/* Every workspace tab's Layout stays mounted at once (visibility-
              toggled, not key-remounted) — switching tabs used to fully
              unmount/remount the whole pane tree, which meant every
              browser pane's <webview> was destroyed and recreated from
              item.url on every switch ("browser는 새로고침되고") and every
              terminal's xterm.js instance was torn down and rebuilt from
              its serialized scrollback (lossy for full-screen TUI apps
              like Claude Code's own interactive mode, reported as scroll
              breaking). Same never-unmount-just-hide pattern PaneGroup.tsx
              already uses one level down for pane-level tabs. */}
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
                  ref={(instance) => setLayoutInstance(tab.id, instance)}
                  model={model}
                  factory={makeFactory(tab.id)}
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
      <ErrorLogPanel />
      <InteractionDebugPanel />
    </div>
  );
}
