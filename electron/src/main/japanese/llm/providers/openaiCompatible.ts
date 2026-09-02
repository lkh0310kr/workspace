import type { JapaneseStudyOpenAiCompatibleConfig } from "../../../../shared/japaneseStudyTypes";
import type { StudyAssistRequest } from "../../../../shared/japaneseStudyTypes";
import { buildStudyPrompt, parseLineResponse } from "../prompts";
import type { StudyLlmProvider } from "../types";

export function createOpenAiCompatibleStudyLlmProvider(
  config: JapaneseStudyOpenAiCompatibleConfig = {},
): StudyLlmProvider {
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = config.model ?? "gpt-4o-mini";
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";

  return {
    id: "openai-compatible",
    label: "OpenAI-compatible HTTP",
    async available() {
      return Boolean(apiKey && baseUrl);
    },
    async complete(req: StudyAssistRequest) {
      if (!apiKey) {
        throw new Error("OpenAI-compatible provider requires apiKey in config or OPENAI_API_KEY");
      }
      const { system, user } = buildStudyPrompt(req);
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`OpenAI-compatible request failed (${response.status}): ${body}`);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
      return parseLineResponse(content, req.task);
    },
  };
}
