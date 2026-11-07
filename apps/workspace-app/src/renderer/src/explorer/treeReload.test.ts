import { describe, expect, it } from "vitest";
import { dirsToReloadForChange } from "./treeReload";

describe("dirsToReloadForChange", () => {
  it("reloads root and expanded parent dirs", () => {
    const expanded = new Set(["src", "src/lib"]);
    expect(dirsToReloadForChange("src/lib/foo.ts", expanded)).toEqual(
      expect.arrayContaining(["", "src", "src/lib"]),
    );
  });

  it("reloads root for top-level file", () => {
    expect(dirsToReloadForChange("README.md", new Set())).toEqual([""]);
  });
});
