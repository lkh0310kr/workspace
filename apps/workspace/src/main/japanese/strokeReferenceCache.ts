import { getJapaneseDb } from "./db";
import { isHanKanjiLiteral, sampleSvgPath, type KanjiStrokeReference } from "./strokeMatch";

let references: KanjiStrokeReference[] | null = null;
let hanByStrokeCount: Map<number, KanjiStrokeReference[]> | null = null;

export function invalidateKanjiStrokeReferenceCache(): void {
  references = null;
  hanByStrokeCount = null;
}

function indexHanByStrokeCount(all: KanjiStrokeReference[]): Map<number, KanjiStrokeReference[]> {
  const map = new Map<number, KanjiStrokeReference[]>();
  for (const reference of all) {
    if (!isHanKanjiLiteral(reference.literal)) continue;
    const count = reference.strokes.length;
    const bucket = map.get(count) ?? [];
    bucket.push(reference);
    map.set(count, bucket);
  }
  return map;
}

export function getKanjiStrokeReferences(): KanjiStrokeReference[] {
  if (references) return references;

  const db = getJapaneseDb();
  if (!db) return [];

  const rows = db
    .prepare("SELECT literal, stroke_order, path FROM kanji_stroke ORDER BY literal, stroke_order")
    .all() as { literal: string; stroke_order: number; path: string }[];

  const grouped = new Map<string, KanjiStrokeReference>();
  for (const row of rows) {
    const entry = grouped.get(row.literal) ?? { literal: row.literal, strokes: [] };
    entry.strokes.push(sampleSvgPath(row.path));
    grouped.set(row.literal, entry);
  }

  references = [...grouped.values()];
  hanByStrokeCount = indexHanByStrokeCount(references);
  return references;
}

/** Han-only references with the same stroke count (±1 fallback). */
export function getKanjiStrokeReferencesForHandwriting(strokeCount: number): KanjiStrokeReference[] {
  if (!references) getKanjiStrokeReferences();
  if (!hanByStrokeCount) return [];

  const exact = hanByStrokeCount.get(strokeCount);
  if (exact && exact.length > 0) return exact;

  const nearby: KanjiStrokeReference[] = [];
  const minus = hanByStrokeCount.get(strokeCount - 1);
  const plus = hanByStrokeCount.get(strokeCount + 1);
  if (minus) nearby.push(...minus);
  if (plus) nearby.push(...plus);
  return nearby;
}
