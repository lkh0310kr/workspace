import { buildStudyPrompt } from "../prompts";
import type { StudyLlmProvider } from "../types";

export function createStubStudyLlmProvider(): StudyLlmProvider {
  return {
    id: "stub",
    label: "Stub (offline placeholder)",
    async available() {
      return true;
    },
    async complete(req) {
      const { user } = buildStudyPrompt(req);
      if (req.task === "translate" || req.task === "translate_to_ko" || req.task === "translate_to_ja") {
        return { lines: [`[stub] ${req.text} → provider를 설정하세요.`] };
      }
      if (req.task === "reading") {
        return { lines: [], note: "읽기를 찾지 못했습니다. Ollama 등 provider를 설정하세요." };
      }
      if (req.task === "practice_sentences") {
        return { lines: ["[stub] 今日は学校に行きます。", "[stub] 私は本を読みます。"] };
      }
      return { lines: [], note: `[stub] ${req.task}\n${user}` };
    },
  };
}
