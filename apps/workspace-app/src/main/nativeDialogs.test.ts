import { describe, expect, it } from "vitest";
import { parseWindowsPickerOutput } from "./nativeDialogs";

describe("parseWindowsPickerOutput", () => {
  it("returns the last non-empty line", () => {
    expect(parseWindowsPickerOutput("noise\r\nC:\\Users\\me\\workspace\r\n")).toBe(
      "C:\\Users\\me\\workspace",
    );
  });

  it("returns null for empty output", () => {
    expect(parseWindowsPickerOutput("  \n\r\n")).toBeNull();
  });
});
