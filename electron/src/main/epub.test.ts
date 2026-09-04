import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { inspectEpubZip } from "./epubInspect";
import { getEbookState, saveEbookState } from "./ebookState";
import { buildMiniEpubBuffer } from "./miniEpub";
import { mergeEbookState } from "../shared/ebookState";

const roots: string[] = [];

afterEach(() => {
  delete process.env.WORKSPACE_TEST_EBOOK_STATE;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("mini EPUB fixture", () => {
  it("parses two linear spine chapters and zip entry sizes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ebook-mini-"));
    roots.push(dir);
    const file = path.join(dir, "mini.epub");
    writeFileSync(file, buildMiniEpubBuffer());

    const book = await inspectEpubZip(new AdmZip(file), "fallback");
    expect(book.title).toBe("Mini Page Turn");
    expect(book.spine.map((item) => item.href)).toEqual(["OEBPS/ch1.xhtml", "OEBPS/ch2.xhtml"]);
    expect(book.sizes["OEBPS/ch1.xhtml"]).toBeGreaterThan(book.sizes["OEBPS/ch2.xhtml"] ?? 0);
    expect(book.sizes["OEBPS/nav.xhtml"]).toBeGreaterThan(0);
  });
});

describe("ebook state", () => {
  it("merges defaults with a CFI patch", () => {
    expect(mergeEbookState(undefined, { cfi: "epubcfi(/6/4!)", theme: "dark" })).toMatchObject({
      theme: "dark",
      fontScale: 1,
      flow: "paginated",
      cfi: "epubcfi(/6/4!)",
    });
  });

  it("round-trips location and bookmarks for a book path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ebook-state-"));
    roots.push(dir);
    process.env.WORKSPACE_TEST_EBOOK_STATE = path.join(dir, "ebook-state.json");
    const bookPath = path.join(dir, "book.epub");
    saveEbookState(bookPath, {
      cfi: "epubcfi(/6/4!)",
      fraction: 0.25,
      bookmarks: [{ cfi: "epubcfi(/6/4!)", label: "here", createdAt: "2026-09-04T00:00:00.000Z" }],
    });
    const loaded = getEbookState(bookPath);
    expect(loaded.cfi).toBe("epubcfi(/6/4!)");
    expect(loaded.fraction).toBe(0.25);
    expect(loaded.bookmarks).toHaveLength(1);
  });
});
