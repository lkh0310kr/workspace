import { describe, expect, it } from "vitest";
import {
  createEmptyMarkdownTab,
  findReplaceableEditorTab,
  isEmptyEditorTab,
  isReplaceableEditorSlot,
} from "./paneTabSlots";
import type { PaneTabItem } from "./paneTypes";

describe("paneTabSlots", () => {
  const empty: PaneTabItem = { id: "m1", kind: "markdown", filePath: null };
  const file: PaneTabItem = { id: "m2", kind: "markdown", filePath: "foo.md" };
  const preview: PaneTabItem = { id: "m3", kind: "markdown", filePath: "bar.md", isPreview: true };

  it("detects empty editor tabs", () => {
    expect(isEmptyEditorTab(empty)).toBe(true);
    expect(isEmptyEditorTab(file)).toBe(false);
    expect(isReplaceableEditorSlot(preview)).toBe(true);
  });

  it("prefers the active empty tab as the replace slot", () => {
    const found = findReplaceableEditorTab([file, empty], empty.id, () => false);
    expect(found?.id).toBe("m1");
  });

  it("skips dirty replaceable tabs", () => {
    const found = findReplaceableEditorTab([empty], empty.id, (id) => id === empty.id);
    expect(found).toBeUndefined();
  });

  it("creates a markdown new-tab item", () => {
    const tab = createEmptyMarkdownTab();
    expect(tab.kind).toBe("markdown");
    expect(tab.filePath).toBeNull();
  });
});
