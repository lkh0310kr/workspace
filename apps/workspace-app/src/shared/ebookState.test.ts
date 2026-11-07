import { describe, expect, it } from "vitest";
import { EBOOK_STATE_SCHEMA, mergeEbookState } from "./ebookState";

describe("mergeEbookState", () => {
  it("defaults a book that has never been opened to the app's theme", () => {
    expect(mergeEbookState(undefined, {}).theme).toBe("auto");
  });

  it("keeps a stored light theme", () => {
    expect(mergeEbookState({ schema: EBOOK_STATE_SCHEMA, theme: "light" }, {}).theme).toBe("light");
  });

  it("keeps stored sepia and dark themes", () => {
    expect(mergeEbookState({ theme: "sepia" }, {}).theme).toBe("sepia");
    expect(mergeEbookState({ theme: "dark" }, {}).theme).toBe("dark");
  });

  it("stamps the schema on merge", () => {
    const merged = mergeEbookState({ theme: "light" }, { theme: "light" });
    expect(merged.theme).toBe("light");
    expect(merged.schema).toBe(EBOOK_STATE_SCHEMA);
  });

  it("defaults click-to-turn on for books opened before the setting existed", () => {
    expect(mergeEbookState(undefined, {}).clickToTurn).toBe(true);
    expect(mergeEbookState({ cfi: "epubcfi(/6/4)" }, {}).clickToTurn).toBe(true);
  });

  it("persists click prevention when turned on", () => {
    expect(mergeEbookState({}, { clickToTurn: false }).clickToTurn).toBe(false);
  });

  it("preserves bookmarks when a patch touches only the location", () => {
    const bookmarks = [{ cfi: "epubcfi(/6/2)", label: "One", createdAt: "2026-09-04" }];
    expect(mergeEbookState({ bookmarks }, { cfi: "epubcfi(/6/8)" }).bookmarks).toEqual(bookmarks);
  });
});
