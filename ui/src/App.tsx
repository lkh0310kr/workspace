import { useCallback, useEffect, useRef, useState } from "react";
import { IJsonModel, Layout, Model, TabNode, Actions } from "flexlayout-react";
import "flexlayout-react/style/combined.css";
import { PaneFrame } from "./components/PaneFrame";
import { WorkspaceTabRail } from "./components/WorkspaceTabRail";
import { SettingsDialog } from "./components/SettingsDialog";
import { useWorkspace } from "./components/useWorkspace";
import { addPaneToTabSet, replacePane, splitTabSet } from "./layout/layoutActions";
import { PaneComponent, PaneConfig } from "./layout/paneTypes";
import { CodePane } from "./panes/CodePane";
import { MarkdownPane } from "./panes/MarkdownPane";
import { TerminalPane } from "./panes/TerminalPane";
import { BrowserPane } from "./panes/BrowserPane";
import { CefBrowserPane } from "./panes/CefBrowserPane";
import { browserCleanupAll, browserHideAll } from "./browser";
import { popOverlayBlock, pushOverlayBlock } from "./browser/overlayBarrier";
import { WorkspaceState, setTabLayout } from "./tauri";
import {
  ThemePreference,
  applyThemePreference,
  getStoredThemePreference,
  setStoredThemePreference,
} from "./theme";

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
    splitterSize: 1,
    // Splitter itself stays a thin 1px line visually, but the actual drag
    // hit-test area is padded out by this much on top of it — 1px alone is
    // too easy to miss.
    splitterExtra: 8,
  };
  normalizeLayoutNode(model.layout);
  // flexlayout only loads tab children when tabset is inside a row/column
  const layout = model.layout as { type?: string } | undefined;
  if (layout?.type === "tabset") {
    model.layout = {
      type: "row",
      children: [layout],
    } as IJsonModel["layout"];
  }
  return model;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);

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
        setSettingsOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

    if (component === "browser-cef") {
      return (
        <CefBrowserPane
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
          return <CodePane filePath={config.filePath ?? null} />;
        case "markdown":
          return <MarkdownPane filePath={config.filePath ?? null} />;
        case "terminal":
          return <TerminalPane terminalId={config.terminalId ?? 0} active={true} />;
        default:
          return <div>Unknown pane</div>;
      }
    })();

    return (
      <PaneFrame
        component={component}
        onSplit={onSplit}
        onTypeChange={onTypeChange}
        onClose={onClose}
      >
        {body}
      </PaneFrame>
    );
  }, [modelEpoch]);

  useEffect(() => {
    void browserCleanupAll().catch(console.error);
  }, []);

  // flexlayout's splitter drag is native mousedown/mousemove, not exposed
  // via a prop. Hide browser webviews for the duration so the drag outline
  // (a DOM overlay) isn't covered by a native child webview elsewhere.
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

  const onModelChange = useCallback(() => {
    const model = modelsRef.current.get(activeTabId);
    if (!model) return;
    persistLayout(activeTabId, model);
    setModelEpoch((v) => v + 1);
  }, [activeTabId, persistLayout]);

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
    <div className="app-shell">
      <WorkspaceTabRail
        tabs={workspace.tabs}
        activeTabId={workspace.active_tab_id}
        rootPath={workspace.root_path}
      />
      <div className="layout-host" key={activeTabId}>
        <Layout
          model={activeModel}
          factory={factory}
          onModelChange={onModelChange}
          realtimeResize
        />
      </div>
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          themePreference={themePreference}
          onThemeChange={handleThemeChange}
        />
      )}
    </div>
  );
}
