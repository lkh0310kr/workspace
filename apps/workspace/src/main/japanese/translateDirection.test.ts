import { describe, expect, it } from "vitest";
import { detectTranslateDirection } from "../../shared/studyText";
import { resolveTranslateDirection } from "./translateDirection";

describe("study translate direction", () => {
  it("detects Korean text as to_ja", () => {
    expect(detectTranslateDirection("오늘은 학교에 간다.")).toBe("to_ja");
  });

  it("detects Japanese text as to_ko", () => {
    expect(detectTranslateDirection("今日は学校に行く。")).toBe("to_ko");
  });

  it("honors explicit task direction", () => {
    expect(resolveTranslateDirection({ task: "translate_to_ja", text: "今日は" })).toBe("to_ja");
    expect(resolveTranslateDirection({ task: "translate_to_ko", text: "오늘은" })).toBe("to_ko");
  });
});
