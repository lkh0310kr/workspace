import { describe, expect, it, vi, beforeEach } from "vitest";

const pushOverlayBlock = vi.fn();
const popOverlayBlock = vi.fn();

vi.mock("../browser/overlayBarrier", () => ({
  pushOverlayBlock,
  popOverlayBlock,
}));

vi.mock("../layout/layoutDebugLog", () => ({
  layoutLog: vi.fn(),
}));

describe("dragSession", () => {
  beforeEach(async () => {
    vi.resetModules();
    pushOverlayBlock.mockClear();
    popOverlayBlock.mockClear();
  });

  it("pushes overlay once per drag kind", async () => {
    const { beginDragOverlay, DRAG_OVERLAY } = await import("./dragSession");
    beginDragOverlay(DRAG_OVERLAY.SPLITTER);
    beginDragOverlay(DRAG_OVERLAY.SPLITTER);
    expect(pushOverlayBlock).toHaveBeenCalledTimes(1);
    expect(pushOverlayBlock).toHaveBeenCalledWith("splitter-drag");
  });

  it("pairs tab chip drag payload with overlay block", async () => {
    const { startTabChipDrag, getTabChipDrag, endTabChipDrag } = await import("./dragSession");
    const payload = { sourceTabNodeId: "pane-1", tabId: "tab-a" };
    startTabChipDrag(payload);
    expect(getTabChipDrag()).toEqual(payload);
    expect(pushOverlayBlock).toHaveBeenCalledWith("tab-chip-drag");
    endTabChipDrag();
    expect(getTabChipDrag()).toBeNull();
    expect(popOverlayBlock).toHaveBeenCalledWith("tab-chip-drag");
  });
});
