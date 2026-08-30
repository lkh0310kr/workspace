export interface JapaneseDbStatus {
  ready: boolean;
  path: string | null;
  entryCount: number;
}

export interface JapaneseLexemeSummary {
  entSeq: number;
  primaryWriting: string | null;
  primaryReading: string | null;
  glossPreview: string | null;
}

export interface JapaneseSearchResult {
  query: string;
  hits: JapaneseLexemeSummary[];
}

export interface JapaneseWriting {
  orthography: string;
  priority: string | null;
}

export interface JapaneseReading {
  kana: string;
  priority: string | null;
}

export interface JapaneseGloss {
  lang: string;
  text: string;
  source: string | null;
}

export interface JapaneseSense {
  senseNo: number;
  glosses: JapaneseGloss[];
}

export interface JapaneseLexemeDetail {
  entSeq: number;
  writings: JapaneseWriting[];
  readings: JapaneseReading[];
  senses: JapaneseSense[];
  examples: JapaneseExample[];
  pitchPatterns: JapanesePitchPattern[];
}

export interface JapaneseKanjiReading {
  type: "on" | "kun";
  text: string;
}

export interface JapaneseKanjiDetail {
  literal: string;
  codepoint: number | null;
  strokes: number | null;
  grade: number | null;
  jlpt: number | null;
  readings: JapaneseKanjiReading[];
  linkedLexemes: JapaneseLexemeSummary[];
}

export interface JapaneseStrokePath {
  order: number;
  path: string;
}

export interface JapaneseStrokeData {
  literal: string;
  strokes: JapaneseStrokePath[];
}

export interface JapaneseStrokeCandidate {
  literal: string;
  score: number;
}

export interface JapaneseStrokeRecognitionResult {
  candidates: JapaneseStrokeCandidate[];
}

export interface JapaneseExample {
  id: number;
  textJa: string;
  textEn: string | null;
  textKo: string | null;
}

export interface JapanesePitchPattern {
  reading: string;
  pattern: string;
}

export interface JapanesePracticeScore {
  literal: string;
  score: number;
}

export interface JapaneseSrsCard {
  entSeq: number;
  due: string;
  interval: number;
  ease: number;
}
