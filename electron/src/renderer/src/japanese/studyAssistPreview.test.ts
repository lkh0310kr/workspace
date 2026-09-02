import { describe, expect, it } from "vitest";
import {
  formatAugmentInsertText,
  formatStudyAssistInsertLines,
  formatStudyAssistPreviewText,
  formatStudyChatInsertLines,
} from "./studyAssistPreview";
import type { StudyAssistResult } from "../../../shared/japaneseStudyTypes";

function result(overrides: Partial<StudyAssistResult>): StudyAssistResult {
  return {
    task: "grammar_hint",
    lines: [],
    providerId: "stub",
    ...overrides,
  };
}

describe("studyAssistPreview", () => {
  it("shows note text as plain preview", () => {
    expect(
      formatStudyAssistPreviewText(
        result({ note: "「電話」는 전화를 뜻합니다.", lines: ["ignored"] }),
      ),
    ).toBe("「電話」는 전화를 뜻합니다.");
  });

  it("inserts grammar hints as markdown blockquote in markdown mode", () => {
    expect(
      formatStudyAssistInsertLines(
        result({ note: "조사 は는 주제를 나타냅니다." }),
        "grammar_hint",
        true,
      ),
    ).toEqual(["> 조사 は는 주제를 나타냅니다."]);
  });

  it("inserts translation as plain lines without blockquote", () => {
    expect(
      formatStudyAssistInsertLines(
        result({ task: "translate_to_ko", lines: ["전화"], note: undefined }),
        "translate_to_ko",
        true,
      ),
    ).toEqual(["전화"]);
  });

  it("inserts chat replies as markdown blockquote in markdown mode", () => {
    expect(formatStudyChatInsertLines("전화는 でんわ 입니다.", true)).toEqual([
      "> 전화는 でんわ 입니다.",
    ]);
  });

  it("keeps augment output as raw markdown without blockquote wrapping", () => {
    expect(
      formatAugmentInsertText(
        result({ task: "augment", note: "## 복습\n- [ ] 예문 추가" }),
      ),
    ).toBe("## 복습\n- [ ] 예문 추가");
    expect(
      formatStudyAssistInsertLines(
        result({ task: "augment", note: "## 복습" }),
        "augment",
        true,
      ),
    ).toEqual(["## 복습"]);
  });
});
