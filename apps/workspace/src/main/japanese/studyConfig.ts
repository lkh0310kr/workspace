import { loadConfig, saveConfig } from "../persistence";
import type { JapaneseStudyConfig } from "../../shared/japaneseStudyTypes";
import { GPT4O_MINI_DEFAULTS } from "../../shared/japaneseStudyDefaults";
import { createAppleFmStudyLlmProvider } from "./llm/providers/appleFm";
import { createOllamaStudyLlmProvider } from "./llm/providers/ollama";
import { createOpenAiCompatibleStudyLlmProvider } from "./llm/providers/openaiCompatible";
import { createStubStudyLlmProvider } from "./llm/providers/stub";
import { registerStudyLlmProvider, clearStudyLlmProviders } from "./llm/router";

let initialized = false;

export { GPT4O_MINI_DEFAULTS } from "../../shared/japaneseStudyDefaults";

export function normalizeJapaneseStudyConfig(raw: JapaneseStudyConfig = {}): JapaneseStudyConfig {
  return {
    providerId: raw.providerId ?? "openai-compatible",
    level: raw.level ?? "auto",
    ollama: raw.ollama,
    openaiCompatible: {
      ...GPT4O_MINI_DEFAULTS,
      ...raw.openaiCompatible,
    },
  };
}

export function getJapaneseStudyConfig(): JapaneseStudyConfig {
  const config = loadConfig();
  return normalizeJapaneseStudyConfig(config.japaneseStudy ?? {});
}

export function initJapaneseStudyLlmProviders(): void {
  if (initialized) return;
  initialized = true;

  const studyConfig = getJapaneseStudyConfig();
  registerStudyLlmProvider(createStubStudyLlmProvider());
  registerStudyLlmProvider(createAppleFmStudyLlmProvider());
  registerStudyLlmProvider(createOllamaStudyLlmProvider(studyConfig.ollama));
  registerStudyLlmProvider(createOpenAiCompatibleStudyLlmProvider(studyConfig.openaiCompatible));
}

export function saveJapaneseStudyConfig(patch: JapaneseStudyConfig): JapaneseStudyConfig {
  const config = loadConfig();
  const merged: JapaneseStudyConfig = {
    ...(config.japaneseStudy ?? {}),
    ...patch,
    ollama: { ...(config.japaneseStudy?.ollama ?? {}), ...(patch.ollama ?? {}) },
    openaiCompatible: {
      ...(config.japaneseStudy?.openaiCompatible ?? {}),
      ...(patch.openaiCompatible ?? {}),
    },
  };
  const next = normalizeJapaneseStudyConfig(merged);
  saveConfig({ ...config, japaneseStudy: next });
  refreshJapaneseStudyLlmProviders();
  return next;
}

export function refreshJapaneseStudyLlmProviders(): void {
  initialized = false;
  clearStudyLlmProviders();
  initJapaneseStudyLlmProviders();
}
