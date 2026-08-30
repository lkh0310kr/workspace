import type {
  JapaneseDbStatus,
  JapaneseKanjiDetail,
  JapaneseLexemeDetail,
  JapaneseLexemeSummary,
  JapaneseSearchResult,
  JapaneseStrokeData,
} from "../../shared/japaneseTypes";
import {
  getJapaneseDb,
  getJapaneseDbPath,
  getLexemeCount,
  isJapaneseDbReady,
} from "./db";

function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .replace(/["']/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token}"*`)
    .join(" ");
}

function summarizeLexeme(db: NonNullable<ReturnType<typeof getJapaneseDb>>, entSeq: number): JapaneseLexemeSummary {
  const writing = db
    .prepare("SELECT orthography FROM writing WHERE ent_seq = ? ORDER BY id LIMIT 1")
    .get(entSeq) as { orthography: string } | undefined;
  const reading = db
    .prepare("SELECT kana FROM reading WHERE ent_seq = ? ORDER BY id LIMIT 1")
    .get(entSeq) as { kana: string } | undefined;
  const gloss = db
    .prepare(
      `SELECT g.text
       FROM gloss g
       JOIN sense s ON g.sense_id = s.id
       WHERE s.ent_seq = ?
       ORDER BY s.sense_no, g.id
       LIMIT 1`,
    )
    .get(entSeq) as { text: string } | undefined;

  return {
    entSeq,
    primaryWriting: writing?.orthography ?? null,
    primaryReading: reading?.kana ?? null,
    glossPreview: gloss?.text ?? null,
  };
}

function searchByFts(db: NonNullable<ReturnType<typeof getJapaneseDb>>, query: string, limit: number): number[] {
  const ftsQuery = escapeFtsQuery(query);
  if (!ftsQuery) return [];
  try {
    const rows = db
      .prepare(
        `SELECT ent_seq
         FROM lexeme_fts
         WHERE lexeme_fts MATCH ?
         ORDER BY bm25(lexeme_fts)
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as { ent_seq: number }[];
    return rows.map((row) => row.ent_seq);
  } catch {
    return [];
  }
}

function searchBySubstring(db: NonNullable<ReturnType<typeof getJapaneseDb>>, query: string, limit: number): number[] {
  const like = `%${query.trim()}%`;
  const rows = db
    .prepare(
      `SELECT DISTINCT ent_seq
       FROM (
         SELECT ent_seq FROM writing WHERE orthography LIKE ?
         UNION
         SELECT ent_seq FROM reading WHERE kana LIKE ?
         UNION
         SELECT s.ent_seq
         FROM gloss g
         JOIN sense s ON g.sense_id = s.id
         WHERE g.text LIKE ?
       )
       LIMIT ?`,
    )
    .all(like, like, like, limit) as { ent_seq: number }[];
  return rows.map((row) => row.ent_seq);
}

function searchKanjiLiteral(db: NonNullable<ReturnType<typeof getJapaneseDb>>, query: string): number[] {
  if (!query.trim()) return [];
  const rows = db
    .prepare(
      `SELECT DISTINCT w.ent_seq
       FROM writing w
       WHERE w.orthography LIKE ?
       ORDER BY w.ent_seq
       LIMIT 20`,
    )
    .all(`%${query.trim()}%`) as { ent_seq: number }[];
  return rows.map((row) => row.ent_seq);
}

export function getJapaneseDbStatus(): JapaneseDbStatus {
  let path: string | null = null;
  try {
    path = getJapaneseDbPath();
  } catch {
    path = null;
  }
  return {
    ready: isJapaneseDbReady(),
    path,
    entryCount: getLexemeCount(),
  };
}

export function searchJapaneseDictionary(query: string, limit = 30): JapaneseSearchResult {
  const db = getJapaneseDb();
  if (!db || !query.trim()) {
    return { query, hits: [] };
  }

  let entSeqs = searchByFts(db, query, limit);
  if (entSeqs.length === 0) entSeqs = searchBySubstring(db, query, limit);

  const hits = entSeqs.map((entSeq) => summarizeLexeme(db, entSeq));
  return { query, hits };
}

export function getJapaneseLexeme(entSeq: number): JapaneseLexemeDetail | null {
  const db = getJapaneseDb();
  if (!db) return null;

  const lexeme = db.prepare("SELECT ent_seq FROM lexeme WHERE ent_seq = ?").get(entSeq) as
    | { ent_seq: number }
    | undefined;
  if (!lexeme) return null;

  const writings = db
    .prepare("SELECT orthography, priority FROM writing WHERE ent_seq = ? ORDER BY id")
    .all(entSeq) as JapaneseLexemeDetail["writings"];
  const readings = db
    .prepare("SELECT kana, priority FROM reading WHERE ent_seq = ? ORDER BY id")
    .all(entSeq) as JapaneseLexemeDetail["readings"];
  const senseRows = db
    .prepare("SELECT id, sense_no FROM sense WHERE ent_seq = ? ORDER BY sense_no")
    .all(entSeq) as { id: number; sense_no: number }[];

  const senses = senseRows.map((sense) => ({
    senseNo: sense.sense_no,
    glosses: db
      .prepare("SELECT lang, text, source FROM gloss WHERE sense_id = ? ORDER BY id")
      .all(sense.id) as JapaneseLexemeDetail["senses"][number]["glosses"],
  }));

  const examples = db
    .prepare(
      `SELECT e.id, e.text_ja, e.text_en, e.text_ko
       FROM example e
       JOIN lexeme_example le ON le.example_id = e.id
       WHERE le.ent_seq = ?
       ORDER BY e.id`,
    )
    .all(entSeq) as { id: number; text_ja: string; text_en: string | null; text_ko: string | null }[];

  return {
    entSeq,
    writings,
    readings,
    senses,
    examples: examples.map((example) => ({
      id: example.id,
      textJa: example.text_ja,
      textEn: example.text_en,
      textKo: example.text_ko,
    })),
  };
}

export function getJapaneseKanji(literal: string): JapaneseKanjiDetail | null {
  const db = getJapaneseDb();
  if (!db || !literal) return null;

  const kanji = db
    .prepare("SELECT literal, codepoint, strokes, grade, jlpt FROM kanji WHERE literal = ?")
    .get(literal) as
    | { literal: string; codepoint: number | null; strokes: number | null; grade: number | null; jlpt: number | null }
    | undefined;
  if (!kanji) return null;

  const readings = db
    .prepare("SELECT type, text FROM kanji_reading WHERE literal = ? ORDER BY type, id")
    .all(literal) as JapaneseKanjiDetail["readings"];

  const linkedRows = db
    .prepare(
      `SELECT DISTINCT w.ent_seq
       FROM writing w
       WHERE w.orthography LIKE ?
       ORDER BY w.ent_seq
       LIMIT 20`,
    )
    .all(`%${literal}%`) as { ent_seq: number }[];

  return {
    literal: kanji.literal,
    codepoint: kanji.codepoint,
    strokes: kanji.strokes,
    grade: kanji.grade,
    jlpt: kanji.jlpt,
    readings,
    linkedLexemes: linkedRows.map((row) => summarizeLexeme(db, row.ent_seq)),
  };
}

export function searchJapaneseByKanji(literal: string): JapaneseSearchResult {
  const db = getJapaneseDb();
  if (!db || !literal.trim()) return { query: literal, hits: [] };
  const entSeqs = searchKanjiLiteral(db, literal);
  return { query: literal, hits: entSeqs.map((entSeq) => summarizeLexeme(db, entSeq)) };
}

export function getJapaneseStrokes(literal: string): JapaneseStrokeData | null {
  const db = getJapaneseDb();
  if (!db || !literal) return null;

  const rows = db
    .prepare("SELECT stroke_order, path FROM kanji_stroke WHERE literal = ? ORDER BY stroke_order")
    .all(literal) as { stroke_order: number; path: string }[];
  if (rows.length === 0) return null;

  return {
    literal,
    strokes: rows.map((row) => ({ order: row.stroke_order, path: row.path })),
  };
}
