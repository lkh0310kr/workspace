import { DockLocation } from "flexlayout-react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TabDragPayload } from "./tabDrag";

const moveTabToGroup = vi.fn();
const moveTabToSplitPane = vi.fn();
const moveTabToNewPane = vi.fn();
const resolveTabDropTarget = vi.fn();

vi.mock("./layoutActions", () => ({
  moveTabToGroup,
  moveTabToSplitPane,
  moveTabToNewPane,
}));

vi.mock("./layoutDebugLog", () => ({
  layoutLog: vi.fn(),
  layoutLogMutation: vi.fn(),
  summarizeLayoutModel: vi.fn(() => null),
}));

vi.mock("./layoutTabDrop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./layoutTabDrop")>();
  return {
    ...actual,
    resolveTabDropTarget,
  };
});

describe("executeTabChipWindowDrop", () => {
  const payload: TabDragPayload = { sourceTabNodeId: "pane-a", tabId: "browser-1" };
  const model = { toJson: () => ({}) } as never;
  const bumpLayout = vi.fn();
  const setActivePaneTab = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    moveTabToGroup.mockReset();
    moveTabToSplitPane.mockReset();
    moveTabToNewPane.mockReset();
    resolveTabDropTarget.mockReset();
    bumpLayout.mockReset();
    setActivePaneTab.mockReset();
  });

  it("merges into target pane on center drop over another pane", async () => {
    moveTabToGroup.mockReturnValue("browser-1");
    resolveTabDropTarget.mockReturnValue({
      targetTabNodeId: "pane-b",
      location: DockLocation.CENTER,
      rect: { left: 0, top: 0, width: 100, height: 100 },
    });
    const { executeTabChipWindowDrop } = await import("./layoutChipWindowDrop");
    const handled = executeTabChipWindowDrop(1, 50, 50, payload, {
      getModel: () => model,
      bumpLayout,
      setActivePaneTab,
    });
    expect(handled).toBe(true);
    expect(moveTabToGroup).toHaveBeenCalled();
    expect(bumpLayout).toHaveBeenCalledWith(1);
    expect(setActivePaneTab).toHaveBeenCalledWith(1, "pane-b", "browser-1");
  });

  it("falls back to new pane when no preview target", async () => {
    resolveTabDropTarget.mockReturnValue(null);
    moveTabToNewPane.mockReturnValue({ tabNodeId: "pane-new", tabItemId: "browser-1" });
    const { executeTabChipWindowDrop } = await import("./layoutChipWindowDrop");
    const handled = executeTabChipWindowDrop(1, 10, 10, payload, {
      getModel: () => model,
      bumpLayout,
      setActivePaneTab,
    });
    expect(handled).toBe(true);
    expect(moveTabToNewPane).toHaveBeenCalled();
    expect(setActivePaneTab).toHaveBeenCalledWith(1, "pane-new", "browser-1");
  });
});
