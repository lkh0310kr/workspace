import { describe, expect, it } from "vitest";
import {
  buildRenamedPath,
  markdownExtensionOf,
  markdownTitleFor,
  validateTitleInput,
} from "./markdownTitleRename";

describe("markdownExtensionOf", () => {
  it("preserves .markdown", () => {
    expect(markdownExtensionOf("notes/foo.markdown")).toBe(".markdown");
    expect(markdownExtensionOf("notes/foo.MARKDOWN")).toBe(".markdown");
  });

  it("defaults to .md", () => {
    expect(markdownExtensionOf("notes/foo.md")).toBe(".md");
    expect(markdownExtensionOf("notes/foo")).toBe(".md");
  });
});

describe("markdownTitleFor", () => {
  it("strips both markdown extensions", () => {
    expect(markdownTitleFor("a/b/note.md")).toBe("note");
    expect(markdownTitleFor("a/b/note.markdown")).toBe("note");
  });

  it("handles Windows-style backslash paths", () => {
    expect(markdownTitleFor("8 animal\\02_공통원리\\유전·육종.md")).toBe("유전·육종");
  });

  it("falls back to Untitled for no path", () => {
    expect(markdownTitleFor(null)).toBe("Untitled");
  });
});

describe("validateTitleInput", () => {
  it("trims whitespace", () => {
    expect(validateTitleInput("  note  ")).toEqual({ title: "note" });
  });

  it("rejects empty/whitespace-only", () => {
    expect(validateTitleInput("   ")).toEqual({ error: "empty" });
  });

  it("rejects path separators", () => {
    expect(validateTitleInput("a/b")).toEqual({ error: "invalid-chars" });
    expect(validateTitleInput("a\\b")).toEqual({ error: "invalid-chars" });
  });
});

describe("buildRenamedPath", () => {
  it("keeps the directory and existing extension", () => {
    expect(buildRenamedPath("notes/old.markdown", "new")).toBe("notes/new.markdown");
    expect(buildRenamedPath("8 animal\\02_공통원리\\old.md", "new")).toBe(
      "8 animal/02_공통원리/new.md",
    );
  });

  it("defaults to .md at root for an untitled tab", () => {
    expect(buildRenamedPath(null, "new")).toBe("new.md");
  });
});
