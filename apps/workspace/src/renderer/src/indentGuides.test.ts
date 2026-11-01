import { describe, expect, it } from "vitest";
import { detectIndentSize, indentGuideColumns } from "./indentGuides";

describe("indent guides", () => {
  it("detects two and four space project indentation from document lines", () => {
    expect(detectIndentSize(["root", "  child", "    nested", "      deeper"], 4)).toBe(2);
    expect(detectIndentSize(["root", "    child", "        nested", "            deeper"], 2)).toBe(4);
  });

  it("places guides at the start of each nested indent level, not at text start", () => {
    expect(indentGuideColumns(4, 4)).toEqual([0]);
    expect(indentGuideColumns(8, 4)).toEqual([0, 4]);
    expect(indentGuideColumns(12, 4)).toEqual([0, 4, 8]);
    expect(indentGuideColumns(6, 2)).toEqual([0, 2, 4]);
  });

  it("uses tab stops for tab indented files", () => {
    expect(detectIndentSize(["root", "\tchild", "\t\tnested"], 4, 4)).toBe(4);
    expect(indentGuideColumns(8, 4)).toEqual([0, 4]);
  });
});
