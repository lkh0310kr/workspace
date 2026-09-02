import { describe, expect, it } from "vitest";
import { initJapaneseStudyLlmProviders } from "./studyConfig";
import { studyAssist } from "./studyAssist";

describe("japanese studyAssist", () => {
  it("returns setup note when no real provider is available", async () => {
    initJapaneseStudyLlmProviders();
    const result = await studyAssist({ task: "grammar_hint", text: "は particle" });
    expect(result.providerId).toBe("unavailable");
    expect(result.note).toContain("LLM provider");
  });
});
