import { describe, expect, it } from "vitest";
import { sameDetail, type DetailView } from "./detailView";

describe("sameDetail", () => {
  it("treats an equivalent view as unchanged so the effect stops re-running", () => {
    expect(sameDetail({ kind: "none" }, { kind: "none" })).toBe(true);
    expect(sameDetail({ kind: "lexeme", entSeq: 12 }, { kind: "lexeme", entSeq: 12 })).toBe(true);
    expect(sameDetail({ kind: "kanji", literal: "枕" }, { kind: "kanji", literal: "枕" })).toBe(true);
  });

  it("reports real navigation", () => {
    expect(sameDetail({ kind: "lexeme", entSeq: 12 }, { kind: "lexeme", entSeq: 13 })).toBe(false);
    expect(sameDetail({ kind: "kanji", literal: "枕" }, { kind: "kanji", literal: "草" })).toBe(false);
    const toKanji: DetailView = { kind: "kanji", literal: "枕" };
    expect(sameDetail({ kind: "none" }, toKanji)).toBe(false);
  });
});
