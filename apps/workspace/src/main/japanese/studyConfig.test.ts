import { describe, expect, it } from "vitest";
import { normalizeJapaneseStudyConfig } from "./studyConfig";

describe("normalizeJapaneseStudyConfig", () => {
  it("defaults to openai-compatible gpt-4o-mini", () => {
    const config = normalizeJapaneseStudyConfig({});
    expect(config.providerId).toBe("openai-compatible");
    expect(config.openaiCompatible?.model).toBe("gpt-4o-mini");
    expect(config.openaiCompatible?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("preserves user api key and overrides", () => {
    const config = normalizeJapaneseStudyConfig({
      openaiCompatible: { apiKey: "sk-test", model: "gpt-4.1-mini" },
    });
    expect(config.openaiCompatible?.apiKey).toBe("sk-test");
    expect(config.openaiCompatible?.model).toBe("gpt-4.1-mini");
  });
});
