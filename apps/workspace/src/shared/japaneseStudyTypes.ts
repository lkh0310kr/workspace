export type StudyLevel = "auto" | "N5" | "N4" | "N3";

export type StudyTranslateDirection = "auto" | "to_ko" | "to_ja";

export type StudyTask =
  | "translate"
  | "translate_to_ko"
  | "translate_to_ja"
  | "breakdown"
  | "reading"
  | "grammar_hint"
  | "check_translation"
  | "practice_sentences"
  | "augment";

export interface StudyAssistContext {
  currentLine?: string;
  previousLines?: string[];
  nextLines?: string[];
  filePath?: string | null;
  fullDocument?: string;
  cursorLine?: number;
  cursorOffset?: number;
}

export interface StudyAssistRequest {
  task: StudyTask;
  text: string;
  context?: StudyAssistContext;
  level?: StudyLevel;
  koreanDraft?: string;
  dictionaryTokens?: StudyToken[];
  translateDirection?: StudyTranslateDirection;
}

export interface StudyToken {
  surface: string;
  reading?: string;
  glossKo?: string;
  entSeq?: number;
  source: "dictionary" | "llm" | "particle";
}

export interface StudyAssistResult {
  task: StudyTask;
  lines: string[];
  tokens?: StudyToken[];
  note?: string;
  providerId: string;
}

export interface JapaneseStudyOllamaConfig {
  baseUrl?: string;
  model?: string;
}

export interface JapaneseStudyOpenAiCompatibleConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface JapaneseStudyConfig {
  providerId?: string;
  level?: StudyLevel;
  ollama?: JapaneseStudyOllamaConfig;
  openaiCompatible?: JapaneseStudyOpenAiCompatibleConfig;
}
