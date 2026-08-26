import { describe, expect, it } from "vitest";
import { paneChipContentShown, paneChipContentStyle } from "./embedPolicy";

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
});
