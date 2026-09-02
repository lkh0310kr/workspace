import { describe, expect, it } from "vitest";
import type { StudyAssistRequest } from "../../../shared/japaneseStudyTypes";
import { buildAppleFmUserPrompt, buildStudyLlmMessages, trimChatHistoryForLlm } from "./prompts";

describe("study chat prompts", () => {
  const baseReq: StudyAssistRequest = {
    task: "chat",
    text: "電話",
    context: {
      filePath: "notes/diary.md",
      currentLine: "昨日電話した。",
      previousLines: ["月曜日", "火曜日"],
      nextLines: ["今日は休み。"],
    },
    dictionaryTokens: [{ surface: "電話", reading: "でんわ", glossKo: "전화", source: "dictionary" }],
    messages: [{ role: "user", content: "ㅎㅇ" }],
    userMessage: "이게 무슨 뜻이야?",
  };

  it("uses tutor system prompt instead of one-line translation rule", () => {
    const messages = buildStudyLlmMessages(baseReq);
    const system = messages[0]?.content ?? "";
    expect(system).toContain("튜터");
    expect(system).toContain("번역 한 단어만 반복하지 마세요");
    expect(system).not.toContain("한 줄만 출력");
  });

  it("includes expanded document context in the anchor block", () => {
    const messages = buildStudyLlmMessages(baseReq);
    const anchor = messages[1]?.content ?? "";
    expect(anchor).toContain("notes/diary.md");
    expect(anchor).toContain("앞 문맥");
    expect(anchor).toContain("月曜日");
    expect(anchor).toContain("でんわ");
  });

  it("folds apple fm chat with system and history labels", () => {
    const prompt = buildAppleFmUserPrompt(baseReq);
    expect(prompt).toContain("[시스템 지침]");
    expect(prompt).toContain("학습자: ㅎㅇ");
    expect(prompt).toContain("학습자: 이게 무슨 뜻이야?");
    expect(prompt).toContain("튜터:");
  });

  it("trims long chat history for llm calls", () => {
    const long = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn-${i}`,
    }));
    const trimmed = trimChatHistoryForLlm(long);
    expect(trimmed).toHaveLength(40);
    expect(trimmed[0]?.content).toBe("turn-10");
  });
});

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
