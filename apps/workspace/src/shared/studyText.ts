const JAPANESE_RE = /[\u3040-\u30ff\u4e00-\u9fff]/gu;
const HANGUL_RE = /\p{Script=Hangul}/gu;

export type StudyTranslateDirection = "to_ko" | "to_ja";

export function detectTranslateDirection(text: string): StudyTranslateDirection {
  const japaneseCount = (text.match(JAPANESE_RE) ?? []).length;
  const hangulCount = (text.match(HANGUL_RE) ?? []).length;
  if (hangulCount > japaneseCount) return "to_ja";
  return "to_ko";
}
