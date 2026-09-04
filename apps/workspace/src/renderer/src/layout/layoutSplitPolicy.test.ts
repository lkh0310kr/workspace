import { describe, expect, it } from "vitest";
import { resolveSplitPaneMutationStrategy } from "./layoutSplitPolicy";

describe("layoutSplitPolicy", () => {
  it("uses add-then-delete when splitting the only tab in a pane", () => {
    expect(resolveSplitPaneMutationStrategy(true, true)).toBe("add-then-delete");
  });

  it("uses add-then-update when splitting one of multiple tabs in the same pane", () => {
    expect(resolveSplitPaneMutationStrategy(true, false)).toBe("add-then-update");
  });

  it("uses delete-then-add when moving the last tab to another pane", () => {
    expect(resolveSplitPaneMutationStrategy(false, true)).toBe("delete-then-add");
  });

  it("uses update-then-add when moving a tab but source pane remains", () => {
    expect(resolveSplitPaneMutationStrategy(false, false)).toBe("update-then-add");
  });
});
