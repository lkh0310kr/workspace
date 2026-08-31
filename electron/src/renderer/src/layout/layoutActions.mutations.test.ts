import { Actions } from "flexlayout-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneGroupConfig } from "./paneTypes";
import {
  lastUpdateConfig,
  makeActionModel,
  makePaneNode,
  updateConfigs,
} from "./layoutActions.testHelpers";

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

let nextItemId = 0;

vi.mock("../panes/paneKindRegistry", () => ({
  getPaneKind: (kind: string) => ({
    kind,
    label: kind,
    icon: "",
    tabLabel: () => kind,
    createItem: (id: string, source?: Record<string, unknown>) =>
      Promise.resolve({ id: id || `${kind}-${++nextItemId}`, kind, ...source }),
  }),
  paneKindLabel: (kind: string) => kind,
}));

describe("layoutActions mutations", () => {
  beforeEach(() => {
    vi.resetModules();
    bumpLayoutRevision.mockClear();
    nextItemId = 0;
  });

  describe("moveTabToGroup", () => {
    it("reorders tabs within the same pane", async () => {
      const tabs = [
        { id: "a", kind: "markdown" as const },
        { id: "b", kind: "markdown" as const },
        { id: "c", kind: "markdown" as const },
      ];
      const config: PaneGroupConfig = { tabs, activeTabId: "a" };
      const pane = makePaneNode("pane-a", config);
      const { model, actions } = makeActionModel([pane]);

      const { moveTabToGroup } = await import("./layoutActions");
      const moved = moveTabToGroup(model as never, "pane-a", "c", "pane-a", 0);

      expect(moved).toBe("c");
      expect(actions).toHaveLength(1);
      expect(lastUpdateConfig(actions)?.tabs.map((t) => t.id)).toEqual(["c", "a", "b"]);
    });

    it("merges a tab into another pane and deletes an emptied source pane", async () => {
      const sourceTab = { id: "browser-1", kind: "browser" as const, url: "https://a.test" };
      const targetTab = { id: "md-1", kind: "markdown" as const, filePath: "a.md" };
      const sourcePane = makePaneNode("pane-a", { tabs: [sourceTab], activeTabId: sourceTab.id });
      const targetPane = makePaneNode("pane-b", { tabs: [targetTab], activeTabId: targetTab.id });
      const { model, actions } = makeActionModel([sourcePane, targetPane]);

      const { moveTabToGroup } = await import("./layoutActions");
      const moved = moveTabToGroup(model as never, "pane-a", sourceTab.id, "pane-b", 1);

      expect(moved).toBe(sourceTab.id);
      expect(actions.map((a) => a.type)).toEqual([
        Actions.DELETE_TAB,
        Actions.UPDATE_NODE_ATTRIBUTES,
      ]);
      const merged = lastUpdateConfig(actions);
      expect(merged?.tabs.map((t) => t.id)).toEqual([targetTab.id, sourceTab.id]);
      expect(merged?.activeTabId).toBe(sourceTab.id);
    });

    it("keeps the source pane when other tabs remain", async () => {
      const moving = { id: "a", kind: "markdown" as const };
      const staying = { id: "b", kind: "markdown" as const };
      const targetTab = { id: "c", kind: "markdown" as const };
      const sourcePane = makePaneNode("pane-a", { tabs: [moving, staying], activeTabId: moving.id });
      const targetPane = makePaneNode("pane-b", { tabs: [targetTab], activeTabId: targetTab.id });
      const { model, actions } = makeActionModel([sourcePane, targetPane]);

      const { moveTabToGroup } = await import("./layoutActions");
      moveTabToGroup(model as never, "pane-a", moving.id, "pane-b", 0);

      expect(actions.map((a) => a.type)).toEqual([
        Actions.UPDATE_NODE_ATTRIBUTES,
        Actions.UPDATE_NODE_ATTRIBUTES,
      ]);
      expect(updateConfigs(actions)[0]?.tabs.map((t) => t.id)).toEqual([staying.id]);
    });
  });

  describe("openFileInPaneGroup", () => {
    it("switches to an already-open file tab", async () => {
      const existing = { id: "md-1", kind: "markdown" as const, filePath: "notes/a.md" };
      const pane = makePaneNode("pane-a", { tabs: [existing], activeTabId: existing.id });
      const { model, actions } = makeActionModel([pane]);
      const onJumpToLine = vi.fn();

      const { openFileInPaneGroup } = await import("./layoutActions");
      const id = await openFileInPaneGroup(model as never, "pane-a", "notes/a.md", "markdown", {
        jumpToLine: 12,
        onJumpToLine,
      });

      expect(id).toBe(existing.id);
      expect(actions).toHaveLength(0);
      expect(onJumpToLine).toHaveBeenCalledWith(existing.id, 12);
    });

    it("reuses a clean preview tab instead of adding another", async () => {
      const preview = {
        id: "md-preview",
        kind: "markdown" as const,
        filePath: "old.md",
        isPreview: true,
      };
      const pane = makePaneNode("pane-a", { tabs: [preview], activeTabId: preview.id });
      const { model, actions } = makeActionModel([pane]);

      const { openFileInPaneGroup } = await import("./layoutActions");
      const id = await openFileInPaneGroup(model as never, "pane-a", "notes/new.md", "markdown");

      expect(id).toMatch(/^markdown-/);
      expect(actions).toHaveLength(2);
      const configs = updateConfigs(actions);
      expect(configs[0]?.tabs).toHaveLength(1);
      expect(configs[0]?.tabs[0]?.filePath).toBe("notes/new.md");
      expect(configs[1]?.tabs[0]?.isPreview).toBe(true);
    });

    it("adds a pinned file as a new tab when no replaceable slot exists", async () => {
      const pinned = { id: "md-1", kind: "markdown" as const, filePath: "a.md", isPreview: false };
      const pane = makePaneNode("pane-a", { tabs: [pinned], activeTabId: pinned.id });
      const { model, actions } = makeActionModel([pane]);

      const { openFileInPaneGroup } = await import("./layoutActions");
      const id = await openFileInPaneGroup(model as never, "pane-a", "b.md", "markdown", { pin: true });

      expect(id).toMatch(/^markdown-/);
      expect(lastUpdateConfig(actions)?.tabs).toHaveLength(2);
      expect(lastUpdateConfig(actions)?.tabs.some((t) => t.filePath === "b.md")).toBe(true);
    });
  });

  describe("changeTabKindInGroup", () => {
    it("replaces the tab item when the pane kind changes", async () => {
      const tab = { id: "md-1", kind: "markdown" as const, filePath: "a.md" };
      const pane = makePaneNode("pane-a", { tabs: [tab], activeTabId: tab.id });
      const { model, actions } = makeActionModel([pane]);

      const { changeTabKindInGroup } = await import("./layoutActions");
      const nextId = await changeTabKindInGroup(model as never, "pane-a", tab.id, "browser");

      expect(nextId).toMatch(/^browser-/);
      expect(nextId).not.toBe(tab.id);
      const config = lastUpdateConfig(actions);
      expect(config?.tabs).toHaveLength(1);
      expect(config?.tabs[0]?.kind).toBe("browser");
      expect(config?.activeTabId).toBe(nextId);
    });

    it("returns the same id when the kind is unchanged", async () => {
      const tab = { id: "md-1", kind: "markdown" as const };
      const pane = makePaneNode("pane-a", { tabs: [tab], activeTabId: tab.id });
      const { model, actions } = makeActionModel([pane]);

      const { changeTabKindInGroup } = await import("./layoutActions");
      const nextId = await changeTabKindInGroup(model as never, "pane-a", tab.id, "markdown");

      expect(nextId).toBe(tab.id);
      expect(actions).toHaveLength(0);
    });
  });

  describe("addTabToGroup", () => {
    it("appends a tab and makes it active", async () => {
      const existing = { id: "md-1", kind: "markdown" as const };
      const pane = makePaneNode("pane-a", { tabs: [existing], activeTabId: existing.id });
      const { model, actions } = makeActionModel([pane]);

      const { addTabToGroup } = await import("./layoutActions");
      const id = await addTabToGroup(model as never, "pane-a", "browser", { url: "https://x.test" });

      expect(id).toMatch(/^browser-/);
      const config = lastUpdateConfig(actions);
      expect(config?.tabs).toHaveLength(2);
      expect(config?.activeTabId).toBe(id);
      expect(config?.tabs[1]?.url).toBe("https://x.test");
    });
  });

  describe("setActiveTabInGroup", () => {
    it("updates activeTabId without bumping layout revision", async () => {
      const a = { id: "a", kind: "markdown" as const };
      const b = { id: "b", kind: "markdown" as const };
      const pane = makePaneNode("pane-a", { tabs: [a, b], activeTabId: a.id });
      const { model, actions } = makeActionModel([pane]);

      const { setActiveTabInGroup } = await import("./layoutActions");
      setActiveTabInGroup(model as never, "pane-a", b.id);

      expect(lastUpdateConfig(actions)?.activeTabId).toBe(b.id);
      expect(bumpLayoutRevision).not.toHaveBeenCalled();
    });
  });

  describe("updateTabInGroup", () => {
    it("patches one tab item in place", async () => {
      const tab = { id: "browser-1", kind: "browser" as const, url: "https://old.test" };
      const pane = makePaneNode("pane-a", { tabs: [tab], activeTabId: tab.id });
      const { model, actions } = makeActionModel([pane]);

      const { updateTabInGroup } = await import("./layoutActions");
      updateTabInGroup(model as never, "pane-a", tab.id, {
        url: "https://new.test",
        title: "Example",
      });

      const updated = lastUpdateConfig(actions)?.tabs[0];
      expect(updated?.url).toBe("https://new.test");
      expect(updated?.title).toBe("Example");
    });
  });
});
