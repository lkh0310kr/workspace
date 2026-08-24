import { useCallback, useEffect, useRef, useState } from "react";
import { IJsonModel, Layout, Model, TabNode, Actions, type Action } from "flexlayout-react";
import "flexlayout-react/style/combined.css";
import "./assets/styles.css";
import { PaneFrame } from "./components/PaneFrame";
import { TerminalPaneTitle } from "./components/TerminalPaneTitle";
import { WorkspaceTabRail } from "./components/WorkspaceTabRail";
import { ClaudeUsageStatusBar } from "./components/ClaudeUsageStatusBar";
import { useWorkspace } from "./components/useWorkspace";
import { addPaneToTabSet, replacePane, splitTabSet } from "./layout/layoutActions";
import { setLayoutInstance } from "./layout/layoutRef";
import { PaneComponent, PaneConfig } from "./layout/paneTypes";
import { EditorPane } from "./panes/EditorPane";
import { TerminalPane } from "./panes/TerminalPane";
import { BrowserPane } from "./panes/BrowserPane";
import { browserCleanupAll, browserHideAll } from "./browser";
import { popOverlayBlock, pushOverlayBlock } from "./browser/overlayBarrier";
import { WorkspaceState, setTabLayout } from "./electron";
import { ThemePreference, applyThemePreference, getStoredThemePreference } from "./theme";

// Port of ui/src/App.tsx (task 6: layout/flexlayout-react + workspace tab
// rail). Not ported yet, deliberately: SettingsDialog/AppSettingsDialog
// (per-tab root-path picker, theme preference UI — task 8/polish, not
// blocking layout) and ClaudeUsageStatusBar (task 8, Claude/Cursor usage
// tracking). Theme still applies (defaults from localStorage/system, see
// theme.ts), just without a UI to change it yet — Cmd+, is a no-op for now.

function normalizeLayoutNode(node: unknown) {
  if (!node || typeof node !== "object") return;
  const record = node as unknown as Record<string, unknown>;
  if (record.type === "tabset") {
    record.enableTabStrip = false;
    record.enableSingleTabStretch = false;
  }
  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      normalizeLayoutNode(child);
    }
  }
}

function parseLayout(json: string): IJsonModel {
  const model = JSON.parse(json) as IJsonModel;
  const savedGlobal = model.global ?? {};
  model.global = {
    ...savedGlobal,
    tabEnableClose: true,
    tabSetEnableMaximize: false,
    tabSetEnableDrop: savedGlobal.tabSetEnableDrop ?? true,
    tabSetEnableTabStrip: false,
    tabSetEnableSingleTabStretch: false,
    tabEnableRenderOnDemand: false,
    tabEnableRename: false,
    // splitterSize/splitterExtra (flexlayout-react 0.8.x model attributes)
    // moved to CSS custom properties in 0.10.x — see
    // --flexlayout-splitter-size in styles.css. tabDragSpeed moved from a
    // model attribute to a top-level <Layout> prop — passed there instead.
  };
  normalizeLayoutNode(model.layout);
  const layout = model.layout as { type?: string } | undefined;
  if (layout?.type === "tabset") {
    model.layout = {
      type: "row",
      children: [layout],
    } as IJsonModel["layout"];
  }
  return model;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

function zoomActivePane(model: Model, delta: number) {
  const tabset = model.getActiveTabset();
  const tabNode = tabset?.getSelectedNode();
  if (!tabNode || tabNode.getType() !== "tab") return;
  const config = ((tabNode as TabNode).getConfig() ?? {}) as PaneConfig;
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (config.zoom ?? 1) + delta));
  if (nextZoom === (config.zoom ?? 1)) return;
  model.doAction(
    Actions.updateNodeAttributes(tabNode.getId(), { config: { ...config, zoom: nextZoom } }),
  );
}

function countTabs(model: Model): number {
  let n = 0;
  model.visitNodes((node) => {
    if (node.getType() === "tab") n += 1;
  });
  return n;
}

export default function App() {
  const workspace = useWorkspace();
  const modelsRef = useRef<Map<number, Model>>(new Map());
  const savedLayoutsRef = useRef<Map<number, string>>(new Map());
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splitRef = useRef<
    (
      direction: "right" | "down",
      tabSetId: string,
      component: PaneComponent,
      source?: PaneConfig,
    ) => Promise<void>
  >(async () => {});
  const replaceRef = useRef<
    (tabNodeId: string, component: PaneComponent, source?: PaneConfig) => Promise<void>
  >(async () => {});
  const ensureInflightRef = useRef<Set<number>>(new Set());
  const [modelEpoch, setModelEpoch] = useState(0);
  const pendingRebalanceRef = useRef<string | null>(null);
  const [themePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [railOpen, setRailOpen] = useState(true);

  useEffect(() => {
    return applyThemePreference(themePreference);
  }, [themePreference]);

  const syncModels = useCallback((ws: WorkspaceState) => {
    const seen = new Set<number>();
    for (const tab of ws.tabs) {
      seen.add(tab.id);
      const saved = savedLayoutsRef.current.get(tab.id);
      const existing = modelsRef.current.get(tab.id);
      const emptyModel = existing !== undefined && countTabs(existing) === 0;
      if (saved === tab.layout_json && existing && !emptyModel) {
        continue;
      }
      modelsRef.current.set(tab.id, Model.fromJson(parseLayout(tab.layout_json)));
      if (saved !== tab.layout_json) {
        savedLayoutsRef.current.set(tab.id, tab.layout_json);
      }
    }
    for (const id of modelsRef.current.keys()) {
      if (!seen.has(id)) {
        modelsRef.current.delete(id);
        savedLayoutsRef.current.delete(id);
      }
    }
    setModelEpoch((v) => v + 1);
  }, []);

  useEffect(() => {
    if (workspace) syncModels(workspace);
  }, [workspace, syncModels]);

  const activeTabId = workspace?.active_tab_id ?? 0;
  const activeModel = modelsRef.current.get(activeTabId);
  void modelEpoch;

  const persistLayout = useCallback((tabId: number, model: Model) => {
    const json = JSON.stringify(model.toJson());
    savedLayoutsRef.current.set(tabId, json);
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      setTabLayout(tabId, json).catch(console.error);
    }, 250);
  }, []);

  const bumpLayout = useCallback(() => {
    const model = modelsRef.current.get(activeTabId);
    if (model) persistLayout(activeTabId, model);
    setModelEpoch((v) => v + 1);
  }, [activeTabId, persistLayout]);

  const ensureTerminal = useCallback(
    async (tabId: number, model: Model, tabSetId: string) => {
      if (countTabs(model) > 0 || ensureInflightRef.current.has(tabId)) return;
      ensureInflightRef.current.add(tabId);
      try {
        if (countTabs(model) > 0) return;
        await addPaneToTabSet(model, tabSetId, "terminal");
        if (countTabs(model) > 0) bumpLayout();
      } finally {
        ensureInflightRef.current.delete(tabId);
      }
    },
    [bumpLayout],
  );

  splitRef.current = async (direction, tabSetId, component, source) => {
    const model = modelsRef.current.get(activeTabId);
    if (!model) return;
    await splitTabSet(model, tabSetId, direction, component, source);
    bumpLayout();
  };

  replaceRef.current = async (tabNodeId, component, source) => {
    const model = modelsRef.current.get(activeTabId);
    if (!model) return;
    await replacePane(model, tabNodeId, component, source);
    bumpLayout();
  };

  const factory = useCallback((node: TabNode) => {
    const component = node.getComponent() as PaneComponent;
    const config = (node.getConfig() ?? {}) as PaneConfig;
    const tabSetId = node.getParent()?.getId() ?? "";

    const onSplit = (mode: "split-right" | "split-down", paneType: PaneComponent) => {
      void splitRef.current(
        mode === "split-right" ? "right" : "down",
        tabSetId,
        paneType,
        config,
      );
    };

    const onTypeChange = (paneType: PaneComponent) => {
      void replaceRef.current(node.getId(), paneType, config);
    };

    const onClose = () => {
      node.getModel().doAction(Actions.deleteTab(node.getId()));
    };

    if (component === "browser") {
      return (
        <BrowserPane
          paneId={node.getId()}
          initialUrl={config.url}
          tabNode={node}
          component={component}
          visible={node.isVisible()}
          onSplit={onSplit}
          onTypeChange={onTypeChange}
        />
      );
    }

    const body = (() => {
      switch (component) {
        case "code":
        case "markdown":
          return (
            <EditorPane
              filePath={config.filePath ?? null}
              tabId={activeTabId}
              rootPath={workspace?.tabs.find((t) => t.id === activeTabId)?.root_path ?? ""}
              component={component}
              tabNode={node}
              onSplit={onSplit}
              onTypeChange={onTypeChange}
              onClose={onClose}
            />
          );
        case "terminal":
          return (
            <TerminalPane terminalId={config.terminalId ?? 0} active={true} zoom={config.zoom ?? 1} />
          );
        default:
          return <div>Unknown pane</div>;
      }
    })();

    return (
      <PaneFrame
        component={component}
        tabNode={node}
        title={component === "terminal" ? <TerminalPaneTitle /> : undefined}
        hideHeader={component === "code" || component === "markdown"}
        onSplit={onSplit}
        onTypeChange={onTypeChange}
        onClose={onClose}
      >
        {body}
      </PaneFrame>
    );
  }, [modelEpoch, activeTabId, workspace]);

  useEffect(() => {
    void browserCleanupAll().catch(console.error);
  }, []);

  useEffect(() => {
    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".flexlayout__splitter")) return;
      dragging = true;
      pushOverlayBlock();
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      popOverlayBlock();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      if (dragging) popOverlayBlock();
    };
  }, []);

  useEffect(() => {
    void browserHideAll().catch(console.error);
  }, [activeTabId]);

  const onAction = useCallback(
    (action: Action) => {
      if (action.type !== Actions.MOVE_NODE) return action;
      const model = modelsRef.current.get(activeTabId);
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
        pendingRebalanceRef.current = action.data.fromNode;
      }
      return action;
    },
    [activeTabId],
  );

  const onModelChange = useCallback(() => {
    const model = modelsRef.current.get(activeTabId);
    if (!model) return;
    if (pendingRebalanceRef.current) {
      const draggedId = pendingRebalanceRef.current;
      pendingRebalanceRef.current = null;
      const parent = model.getNodeById(draggedId)?.getParent()?.getParent();
      if (parent) {
        model.doAction(Actions.adjustWeights(parent.getId(), parent.getChildren().map(() => 1)));
      }
    }
    persistLayout(activeTabId, model);
    setModelEpoch((v) => v + 1);
  }, [activeTabId, persistLayout]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "=" && e.key !== "+" && e.key !== "-" && e.key !== "_") return;
      const model = modelsRef.current.get(activeTabId);
      if (!model) return;
      e.preventDefault();
      const grow = e.key === "=" || e.key === "+";
      zoomActivePane(model, grow ? ZOOM_STEP : -ZOOM_STEP);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId]);

  useEffect(() => {
    const model = modelsRef.current.get(activeTabId);
    if (!model || countTabs(model) > 0) return;

    let tabSetId: string | undefined;
    model.visitNodes((node) => {
      if (!tabSetId && node.getType() === "tabset") {
        tabSetId = node.getId();
      }
    });
    if (tabSetId) {
      void ensureTerminal(activeTabId, model, tabSetId);
    }
  }, [activeTabId, modelEpoch, ensureTerminal]);

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
          onClick={() => setRailOpen((open) => !open)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
          </svg>
        </button>
      </div>
      <div className="app-shell">
        {railOpen && (
          <WorkspaceTabRail
            tabs={workspace.tabs}
            activeTabId={workspace.active_tab_id}
            onOpenSettings={() => {}}
          />
        )}
        <div className="layout-host" key={activeTabId}>
          <Layout
            ref={setLayoutInstance}
            model={activeModel}
            factory={factory}
            onAction={onAction}
            onModelChange={onModelChange}
            realtimeResize
            tabDragSpeed={0}
          />
        </div>
      </div>
      <ClaudeUsageStatusBar />
    </div>
  );
}
