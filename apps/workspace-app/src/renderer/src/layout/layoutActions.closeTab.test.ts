import { Actions, TabNode } from "flexlayout-react";
import { describe, expect, it, vi } from "vitest";
import type { PaneGroupConfig } from "./paneTypes";

vi.mock("../store/workspaceStore", () => ({
  useWorkspaceStore: { getState: () => ({ bumpLayoutRevision: vi.fn() }) },
}));

vi.mock("../store/workspaceLayoutModels", () => ({
  findTabIdForModel: () => 1,
}));

vi.mock("./layoutDebugLog", () => ({
  layoutLog: vi.fn(),
  layoutLogMutation: vi.fn(),
  summarizeLayoutModel: vi.fn(() => null),
}));

const terminalItem = { id: "terminal-1", kind: "terminal" as const, terminalId: 42 };

vi.mock("../panes/paneKindRegistry", () => ({
  getPaneKind: (kind: string) => ({
    kind,
    label: kind,
    icon: "",
    tabLabel: () => kind,
    createItem: (id: string) =>
      Promise.resolve(
        kind === "terminal" ? { ...terminalItem, id } : { id, kind },
      ),
  }),
  paneKindLabel: (kind: string) => kind,
}));

function makePaneNode(id: string, config: PaneGroupConfig) {
  return Object.assign(Object.create(TabNode.prototype), {
    getType: () => "tab",
    getId: () => id,
    getConfig: () => config,
  });
}

function makeModel(panes: ReturnType<typeof makePaneNode>[]) {
  const actions: string[] = [];
  const model = {
    getNodeById: (id: string) => panes.find((pane) => pane.getId() === id) ?? null,
    visitNodes: (visit: (node: { getType: () => string }) => void) => {
      for (const pane of panes) visit(pane);
    },
    getActiveTabset: () => null,
    doAction: (action: { type: string }) => {
      actions.push(action.type);
    },
  };
  return { model, actions };
}

describe("closeActivePaneTab", () => {
  it("closes the tab in the store-tracked focused tabset, not only flexlayout active tabset", async () => {
    const tabItem = { id: "md-1", kind: "markdown" as const };
    const config: PaneGroupConfig = { tabs: [tabItem], activeTabId: tabItem.id };
    const paneNode = makePaneNode("pane-b", config);
    const focusedTabset = {
      getType: () => "tabset",
      getSelectedNode: () => paneNode,
    };
    const staleTabset = {
      getType: () => "tabset",
      getSelectedNode: () => null,
    };
    const actions: string[] = [];
    const model = {
      getNodeById: (id: string) => {
        if (id === "tabset-focused") return focusedTabset;
        if (id === "pane-b") return paneNode;
        return null;
      },
      visitNodes: (visit: (node: { getType: () => string }) => void) => visit(paneNode),
      getActiveTabset: () => staleTabset,
      doAction: (action: { type: string }) => {
        actions.push(action.type);
      },
    };

    const { closeActivePaneTab } = await import("./layoutActions");
    const closed = await closeActivePaneTab(model as never, "tabset-focused");

    expect(closed).toBe(true);
    expect(actions).toEqual([Actions.UPDATE_NODE_ATTRIBUTES]);
  });
});

describe("closeTabInGroup", () => {
  it("resets the sole workspace pane to a default terminal when closing the last tab", async () => {
    const tabItem = { id: "md-1", kind: "markdown" as const };
    const config: PaneGroupConfig = { tabs: [tabItem], activeTabId: tabItem.id };
    const paneNode = makePaneNode("pane-a", config);
    const { model, actions } = makeModel([paneNode]);

    const { closeTabInGroup } = await import("./layoutActions");
    const nextActive = await closeTabInGroup(model as never, "pane-a", tabItem.id);

    expect(nextActive).toMatch(/^terminal-/);
    expect(actions).toEqual([Actions.UPDATE_NODE_ATTRIBUTES]);
  });

  it("removes the pane when closing the last tab in a split layout", async () => {
    const tabItem = { id: "md-1", kind: "markdown" as const };
    const config: PaneGroupConfig = { tabs: [tabItem], activeTabId: tabItem.id };
    const paneNode = makePaneNode("pane-a", config);
    const otherPane = makePaneNode("pane-b", {
      tabs: [{ id: "md-2", kind: "markdown" }],
      activeTabId: "md-2",
    });
    const { model, actions } = makeModel([paneNode, otherPane]);

    const { closeTabInGroup } = await import("./layoutActions");
    const nextActive = await closeTabInGroup(model as never, "pane-a", tabItem.id);

    expect(nextActive).toBeNull();
    expect(actions).toEqual([Actions.DELETE_TAB]);
  });
});
