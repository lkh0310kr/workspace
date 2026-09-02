import type { JapaneseStudyOllamaConfig } from "../../../../shared/japaneseStudyTypes";
import type { StudyAssistRequest } from "../../../../shared/japaneseStudyTypes";
import { buildStudyLlmMessages, parseLineResponse } from "../prompts";
import type { StudyLlmProvider } from "../types";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.2";

async function resolveOllamaModel(baseUrl: string, configured?: string): Promise<string> {
  if (configured?.trim()) return configured.trim();
  const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return DEFAULT_MODEL;
  const payload = (await response.json()) as { models?: { name: string }[] };
  const names = payload.models?.map((model) => model.name).filter(Boolean) ?? [];
  if (names.length === 0) return DEFAULT_MODEL;
  const preferred = ["llama3.2", "llama3.1", "gemma2", "qwen2.5", "mistral", "phi3"];
  for (const hint of preferred) {
    const hit = names.find((name) => name.startsWith(hint));
    if (hit) return hit;
  }
  return names[0] ?? DEFAULT_MODEL;
}

export function createOllamaStudyLlmProvider(config: JapaneseStudyOllamaConfig = {}): StudyLlmProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const configuredModel = config.model;

  return {
    id: "ollama",
    label: "Ollama",
    async available() {
      try {
        const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        return response.ok;
      } catch {
        return false;
      }
    },
    async complete(req: StudyAssistRequest) {
      const model = await resolveOllamaModel(baseUrl, configuredModel);
      const messages = buildStudyLlmMessages(req);
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Ollama request failed (${response.status}): ${body}`);
      }
      const payload = (await response.json()) as { message?: { content?: string } };
      const content = payload.message?.content?.trim() ?? "";
      return parseLineResponse(content, req.task);
    },
  };
}
