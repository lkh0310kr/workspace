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
  | "chat"
  | "augment";

export type StudyChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface StudyAssistContext {
  /** @deprecated use previousLines */
  previousLine?: string;
  /** @deprecated use nextLines */
  nextLine?: string;
  currentLine?: string;
  previousLines?: string[];
  nextLines?: string[];
  filePath?: string | null;
  fullDocument?: string;
  cursorLine?: number;
  cursorOffset?: number;
}

export interface StudyChatSessionKey {
  filePath: string | null;
  selectionText: string;
  selectionFrom: number;
  selectionTo: number;
}

export interface StudyChatSession {
  sessionId: string;
  filePath: string | null;
  selectionText: string;
  selectionFrom: number;
  selectionTo: number;
  messages: StudyChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyAssistRequest {
  task: StudyTask;
  text: string;
  context?: StudyAssistContext;
  level?: StudyLevel;
  koreanDraft?: string;
  dictionaryTokens?: StudyToken[];
  translateDirection?: StudyTranslateDirection;
  /** Prior turns for task `chat`. */
  messages?: StudyChatMessage[];
  /** Latest user message for task `chat`. */
  userMessage?: string;
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
