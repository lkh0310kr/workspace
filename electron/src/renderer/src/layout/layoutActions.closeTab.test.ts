import { TabNode } from "flexlayout-react";
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

vi.mock("../panes/paneKindRegistry", () => ({
  getPaneKind: (kind: string) => ({ kind, label: kind, icon: "", tabLabel: () => kind, createItem: () => ({ id: "x", kind }) }),
  paneKindLabel: (kind: string) => kind,
}));

describe("closeActivePaneTab", () => {
  it("closes the tab in the store-tracked focused tabset, not only flexlayout active tabset", async () => {
    const tabItem = { id: "md-1", kind: "markdown" as const };
    const config: PaneGroupConfig = { tabs: [tabItem], activeTabId: tabItem.id };
    const paneNode = Object.assign(Object.create(TabNode.prototype), {
      getType: () => "tab",
      getId: () => "pane-b",
      getConfig: () => config,
    });
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
      getActiveTabset: () => staleTabset,
      doAction: (action: { type: string }) => {
        actions.push(action.type);
      },
    };

    const { closeActivePaneTab } = await import("./layoutActions");
    const closed = closeActivePaneTab(model as never, "tabset-focused");

    expect(closed).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
  });
});
