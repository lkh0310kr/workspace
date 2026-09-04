import { describe, expect, it } from "vitest";
import { EBOOK_STATE_SCHEMA, mergeEbookState } from "./ebookState";

describe("mergeEbookState", () => {
  it("defaults a book that has never been opened to the app's theme", () => {
    expect(mergeEbookState(undefined, {}).theme).toBe("auto");
  });

  it("reads schema 0's baked-in 'light' as the default it was, not a choice", () => {
    const stored = { theme: "light", cfi: "epubcfi(/6/4)", fontScale: 1.2 } as const;
    const merged = mergeEbookState(stored, {});
    expect(merged.theme).toBe("auto");
    expect(merged.cfi).toBe("epubcfi(/6/4)");
    expect(merged.fontScale).toBe(1.2);
  });

  it("keeps a light theme chosen after the migration", () => {
    expect(mergeEbookState({ schema: EBOOK_STATE_SCHEMA, theme: "light" }, {}).theme).toBe("light");
  });

  it("keeps schema 0 themes that could only have been chosen deliberately", () => {
    expect(mergeEbookState({ theme: "sepia" }, {}).theme).toBe("sepia");
    expect(mergeEbookState({ theme: "dark" }, {}).theme).toBe("dark");
  });

  it("lets an explicit patch win over the migration and stamps the schema", () => {
    const merged = mergeEbookState({ theme: "light" }, { theme: "light" });
    expect(merged.theme).toBe("light");
    expect(merged.schema).toBe(EBOOK_STATE_SCHEMA);
  });

  it("preserves bookmarks when a patch touches only the location", () => {
    const bookmarks = [{ cfi: "epubcfi(/6/2)", label: "One", createdAt: "2026-09-04" }];
    expect(mergeEbookState({ bookmarks }, { cfi: "epubcfi(/6/8)" }).bookmarks).toEqual(bookmarks);
  });
});
