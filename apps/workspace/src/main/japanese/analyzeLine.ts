import type { StudyAssistResult, StudyToken } from "../../shared/japaneseStudyTypes";
import { lookupJapaneseSurface } from "./service";
import { isParticle, segmentJapaneseLine, stripTrailingPunctuation } from "./segment";

function tokenFromSurface(surface: string): StudyToken {
  if (isParticle(surface)) {
    return { surface, source: "particle" };
  }

  const lexeme = lookupJapaneseSurface(surface);
  if (!lexeme) {
    return { surface, source: "llm" };
  }

  return {
    surface,
    reading: lexeme.primaryReading ?? undefined,
    glossKo: lexeme.glossPreview ?? undefined,
    entSeq: lexeme.entSeq,
    source: "dictionary",
  };
}

function formatBreakdownNote(tokens: StudyToken[]): string {
  return tokens
    .map((token) => {
      const reading = token.reading ? `(${token.reading})` : "";
      const gloss = token.glossKo ? `: ${token.glossKo}` : "";
      return `${token.surface}${reading}${gloss}`;
    })
    .join(" · ");
}

export function analyzeJapaneseLine(text: string): StudyAssistResult {
  const trimmed = text.trim();
  const lookup = (surface: string) => lookupJapaneseSurface(surface) != null;
  const surfaces = segmentJapaneseLine(trimmed, lookup);
  const tokens = surfaces.map((surface) => tokenFromSurface(surface));

  return {
    task: "breakdown",
    lines: [],
    tokens,
    note: tokens.length > 0 ? formatBreakdownNote(tokens) : undefined,
    providerId: "dictionary-only",
  };
}

export function analyzeJapaneseReading(text: string): StudyAssistResult {
  const trimmed = text.trim();
  const lexeme = lookupJapaneseSurface(trimmed);
  const reading = lexeme?.primaryReading ?? null;

  return {
    task: "reading",
    lines: reading ? [reading] : [],
    tokens: lexeme
      ? [
          {
            surface: trimmed,
            reading: reading ?? undefined,
            glossKo: lexeme.glossPreview ?? undefined,
            entSeq: lexeme.entSeq,
            source: "dictionary",
          },
        ]
      : [{ surface: trimmed, source: "llm" }],
    note: reading ? undefined : "사전에서 읽기를 찾지 못했습니다.",
    providerId: "dictionary-only",
  };
}

export function analyzeLineForContext(text: string): StudyToken[] {
  const lookup = (surface: string) => lookupJapaneseSurface(surface) != null;
  return segmentJapaneseLine(text, lookup).map((surface) => tokenFromSurface(surface));
}

export function isLikelyJapaneseStudyLine(text: string): boolean {
  const { body } = stripTrailingPunctuation(text.trim());
  return /[\u3040-\u30ff\u4e00-\u9fff]/u.test(body);
}
