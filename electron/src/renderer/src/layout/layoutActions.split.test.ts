import { Actions, DockLocation, TabNode } from "flexlayout-react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PaneGroupConfig } from "./paneTypes";

const bumpLayoutRevision = vi.fn();

vi.mock("../store/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => ({ bumpLayoutRevision }),
  },
}));

vi.mock("../store/workspaceLayoutModels", () => ({
  findTabIdForModel: () => 1,
}));

vi.mock("./layoutDebugLog", () => ({
  layoutLog: vi.fn(),
  layoutLogMutation: vi.fn(),
  summarizeLayoutModel: vi.fn(() => null),
}));

describe("moveTabToSplitPane", () => {
  beforeEach(() => {
    vi.resetModules();
    bumpLayoutRevision.mockClear();
  });

  it("adds new pane before deleting when splitting the only tab in a pane", async () => {
    const actions: string[] = [];
    const tabItem = { id: "browser-1", kind: "browser" as const, url: "https://example.com" };
    const config: PaneGroupConfig = { tabs: [tabItem], activeTabId: tabItem.id };
    const sourceNode = Object.assign(Object.create(TabNode.prototype), {
      getType: () => "tab",
      getId: () => "pane-a",
      getConfig: () => config,
      getParent: () => ({ getType: () => "tabset", getId: () => "tabset-1" }),
    });
    const model = {
      getNodeById: (id: string) => (id === "pane-a" ? sourceNode : null),
      doAction: (action: { type: string }) => {
        actions.push(action.type);
      },
    };

    const { moveTabToSplitPane } = await import("./layoutActions");
    const result = moveTabToSplitPane(
      model as never,
      "pane-a",
      tabItem.id,
      "pane-a",
      DockLocation.RIGHT,
    );

    expect(result).toEqual({ tabNodeId: expect.stringMatching(/^tabgroup-/), tabItemId: tabItem.id });
    expect(actions[0]).toBe(Actions.ADD_TAB);
    expect(actions[1]).toBe(Actions.DELETE_TAB);
    expect(bumpLayoutRevision).toHaveBeenCalledWith(1);
  });
});
