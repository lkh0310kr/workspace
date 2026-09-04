import { lookupJapaneseSurface, searchJapaneseDictionary } from "./service";

const HANGUL_RE = /\p{Script=Hangul}/u;

/** Exact JMdict/KRDICT hit: 食べる → 먹다 */
export function tryDictionaryTranslateToKo(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lexeme = lookupJapaneseSurface(trimmed);
  return lexeme?.glossPreview ?? null;
}

/** Korean gloss search: 먹다 → 食べる (single word / short query) */
export function tryDictionaryTranslateToJa(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || !HANGUL_RE.test(trimmed)) return null;
  if (trimmed.includes(" ")) return null;

  const result = searchJapaneseDictionary(trimmed, 5);
  const hit = result.hits.find((entry) => entry.primaryWriting || entry.primaryReading);
  if (!hit) return null;
  return hit.primaryWriting ?? hit.primaryReading ?? null;
}
