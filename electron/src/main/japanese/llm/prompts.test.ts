import { describe, expect, it } from "vitest";
import type { StudyAssistRequest } from "../../../shared/japaneseStudyTypes";
import { buildStudyLlmMessages } from "./prompts";

describe("augment prompts", () => {
  const augmentReq: StudyAssistRequest = {
    task: "augment",
    text: ".",
    context: {
      filePath: "notes/grammar.md",
      fullDocument: "# 助詞\n\nは topic marker.",
      cursorLine: 3,
      cursorOffset: 20,
      currentLine: "",
      previousLines: ["は topic marker."],
      nextLines: [],
    },
  };

  it("asks for markdown insert-only output with full document context", () => {
    const messages = buildStudyLlmMessages(augmentReq);
    const system = messages[0]?.content ?? "";
    const user = messages[1]?.content ?? "";
    expect(system).toContain("추가 내용만");
    expect(system).toContain("마크다운");
    expect(system).not.toContain("평문만 출력");
    expect(user).toContain("notes/grammar.md");
    expect(user).toContain("커서 줄: 3");
    expect(user).toContain("전체 문서:");
    expect(user).toContain("助詞");
  });
});
