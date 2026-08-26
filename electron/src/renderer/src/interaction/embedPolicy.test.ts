import { describe, expect, it } from "vitest";
import { paneChipContentShown, paneChipContentStyle, workspaceTabHostStyle } from "./embedPolicy";

describe("embedPolicy", () => {
  it("requires pane and chip both active to show content", () => {
    expect(paneChipContentShown(true, true)).toBe(true);
    expect(paneChipContentShown(true, false)).toBe(false);
    expect(paneChipContentShown(false, true)).toBe(false);
    expect(paneChipContentShown(false, false)).toBe(false);
  });

  it("maps shown state to visibility style", () => {
    expect(paneChipContentStyle(true, true)).toMatchObject({
      visibility: "visible",
      pointerEvents: "auto",
    });
    expect(paneChipContentStyle(false, true)).toMatchObject({
      visibility: "hidden",
      pointerEvents: "none",
    });
  });

  it("maps workspace tab active state to host style", () => {
    expect(workspaceTabHostStyle(true)).toMatchObject({
      visibility: "visible",
      pointerEvents: "auto",
    });
    expect(workspaceTabHostStyle(false)).toMatchObject({
      visibility: "hidden",
      pointerEvents: "none",
    });
  });
});
