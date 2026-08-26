import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Model } from "flexlayout-react";
import type { TabInfo, WorkspaceState } from "../electron";
import { setTabLayout } from "../electron";
import { countLayoutTabs, modelFromLayoutJson } from "../layout/layoutModelParse";
import { layoutLog, layoutLogModel } from "../layout/layoutDebugLog";
import { paneTabStoreKey } from "./paneTabKey";
function tabsDataEqual(a: TabInfo[], b: TabInfo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => {
    const u = b[i];
    return (
      t.id === u.id &&
      t.title === u.title &&
      layoutJsonEquivalent(t.layout_json, u.layout_json) &&
      t.root_path === u.root_path
    );
  });
}

function layoutJsonEquivalent(saved: string | undefined, incoming: string): boolean {
  if (saved === incoming) return true;
  if (!saved) return false;
  try {
    return JSON.stringify(JSON.parse(saved)) === JSON.stringify(JSON.parse(incoming));
  } catch {
    return saved === incoming;
  }
}

/** flexlayout Model instances — not part of reactive zustand state. */
const modelsByTabId = new Map<number, Model>();
const savedLayoutJsonByTabId = new Map<number, string>();
const ensureInflightTabIds = new Set<number>();
const pendingRebalanceByTabId = new Map<number, string | null>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export type WorkspaceStoreState = {
  hydrated: boolean;
  tabs: TabInfo[];
  activeTabId: number;
  modelEpoch: number;
  activePaneTabByKey: Record<string, string>;
};

type WorkspaceStoreActions = {
  hydrateFromWorkspace: (ws: WorkspaceState) => void;
  syncModelsFromWorkspace: (ws: WorkspaceState) => void;
  bumpModelEpoch: () => void;
  getModel: (tabId: number) => Model | undefined;
  getModelEpoch: () => number;
  persistLayout: (tabId: number, model: Model) => void;
  setPendingRebalance: (tabId: number, nodeId: string | null) => void;
  takePendingRebalance: (tabId: number) => string | null | undefined;
  markEnsureInflight: (tabId: number) => boolean;
  clearEnsureInflight: (tabId: number) => void;
  setActivePaneTab: (workspaceTabId: number, nodeId: string, tabItemId: string) => void;
  getActivePaneTab: (workspaceTabId: number, nodeId: string, fallback: string) => string;
  removePaneTabKeysForWorkspaceTab: (workspaceTabId: number) => void;
};

export const useWorkspaceStore = create<WorkspaceStoreState & WorkspaceStoreActions>()(
  subscribeWithSelector((set, get) => ({
    hydrated: false,
    tabs: [],
    activeTabId: 0,
    modelEpoch: 0,
    activePaneTabByKey: {},

    hydrateFromWorkspace(ws: WorkspaceState) {
      const prev = get();
      const tabsPreserved = prev.hydrated && tabsDataEqual(prev.tabs, ws.tabs);
      const nextTabs = tabsPreserved ? prev.tabs : ws.tabs;
      set({
        hydrated: true,
        tabs: nextTabs,
        activeTabId: ws.active_tab_id,
      });
      if (!tabsPreserved) {
        get().syncModelsFromWorkspace({ ...ws, tabs: nextTabs });
      }
    },

    syncModelsFromWorkspace(ws: WorkspaceState) {
      let modelChanged = false;
      const seen = new Set<number>();
      for (const tab of ws.tabs) {
        seen.add(tab.id);
        const saved = savedLayoutJsonByTabId.get(tab.id);
        const existing = modelsByTabId.get(tab.id);
        const emptyModel = existing !== undefined && countLayoutTabs(existing) === 0;
        if (layoutJsonEquivalent(saved, tab.layout_json) && existing && !emptyModel) {
          continue;
        }
        modelsByTabId.set(tab.id, modelFromLayoutJson(tab.layout_json));
        modelChanged = true;
        layoutLogModel("workspaceStore.syncModelsFromWorkspace", "model loaded", modelsByTabId.get(tab.id), {
          tabId: tab.id,
        }, tab.id);
        if (saved !== tab.layout_json) {
          savedLayoutJsonByTabId.set(tab.id, tab.layout_json);
        }
      }
      for (const id of modelsByTabId.keys()) {
        if (!seen.has(id)) {
          modelsByTabId.delete(id);
          savedLayoutJsonByTabId.delete(id);
          pendingRebalanceByTabId.delete(id);
          ensureInflightTabIds.delete(id);
          get().removePaneTabKeysForWorkspaceTab(id);
          modelChanged = true;
        }
      }
      if (modelChanged) {
        set({ modelEpoch: get().modelEpoch + 1 });
      }
    },

    bumpModelEpoch() {
      set({ modelEpoch: get().modelEpoch + 1 });
    },

    getModel(tabId: number) {
      return modelsByTabId.get(tabId);
    },

    getModelEpoch() {
      return get().modelEpoch;
    },

    persistLayout(tabId: number, model: Model) {
      const json = JSON.stringify(model.toJson());
      savedLayoutJsonByTabId.set(tabId, json);
      layoutLogModel("workspaceStore.persistLayout", "persist scheduled", model, {
        jsonLength: json.length,
      }, tabId);
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        layoutLog("workspaceStore.persistLayout", "persist flush", { tabId, jsonLength: json.length }, tabId);
        setTabLayout(tabId, json).catch(console.error);
      }, 250);
    },

    setPendingRebalance(tabId: number, nodeId: string | null) {
      pendingRebalanceByTabId.set(tabId, nodeId);
    },

    takePendingRebalance(tabId: number) {
      const draggedId = pendingRebalanceByTabId.get(tabId);
      if (draggedId !== undefined) {
        pendingRebalanceByTabId.set(tabId, null);
      }
      return draggedId;
    },

    markEnsureInflight(tabId: number) {
      if (ensureInflightTabIds.has(tabId)) return false;
      ensureInflightTabIds.add(tabId);
      return true;
    },

    clearEnsureInflight(tabId: number) {
      ensureInflightTabIds.delete(tabId);
    },

    setActivePaneTab(workspaceTabId: number, nodeId: string, tabItemId: string) {
      const key = paneTabStoreKey(workspaceTabId, nodeId);
      const prev = get().activePaneTabByKey[key];
      if (prev === tabItemId) return;
      set({ activePaneTabByKey: { ...get().activePaneTabByKey, [key]: tabItemId } });
    },

    getActivePaneTab(workspaceTabId: number, nodeId: string, fallback: string) {
      const key = paneTabStoreKey(workspaceTabId, nodeId);
      return get().activePaneTabByKey[key] ?? fallback;
    },

    removePaneTabKeysForWorkspaceTab(workspaceTabId: number) {
      const prefix = `${workspaceTabId}:`;
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(get().activePaneTabByKey)) {
        if (!key.startsWith(prefix)) next[key] = value;
      }
      set({ activePaneTabByKey: next });
    },
  })),
);

export function selectWorkspaceState(store: WorkspaceStoreState): WorkspaceState | null {
  if (!store.hydrated) return null;
  return { tabs: store.tabs, active_tab_id: store.activeTabId };
}
