import { loadConfig, saveConfig } from "../persistence";
import type { JapaneseStudyConfig } from "../../shared/japaneseStudyTypes";
import { createAppleFmStudyLlmProvider } from "./llm/providers/appleFm";
import { createOllamaStudyLlmProvider } from "./llm/providers/ollama";
import { createOpenAiCompatibleStudyLlmProvider } from "./llm/providers/openaiCompatible";
import { createStubStudyLlmProvider } from "./llm/providers/stub";
import { registerStudyLlmProvider, clearStudyLlmProviders } from "./llm/router";

let initialized = false;

export function getJapaneseStudyConfig(): JapaneseStudyConfig {
  const config = loadConfig();
  return config.japaneseStudy ?? {};
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
  const next: JapaneseStudyConfig = {
    ...(config.japaneseStudy ?? {}),
    ...patch,
    ollama: { ...(config.japaneseStudy?.ollama ?? {}), ...(patch.ollama ?? {}) },
    openaiCompatible: {
      ...(config.japaneseStudy?.openaiCompatible ?? {}),
      ...(patch.openaiCompatible ?? {}),
    },
  };
  saveConfig({ ...config, japaneseStudy: next });
  refreshJapaneseStudyLlmProviders();
  return next;
}

export function refreshJapaneseStudyLlmProviders(): void {
  initialized = false;
  clearStudyLlmProviders();
  initJapaneseStudyLlmProviders();
}
