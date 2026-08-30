import { toHiragana } from "wanakana";
import type {
  JapaneseDbStatus,
  JapaneseKanjiDetail,
  JapaneseLexemeDetail,
  JapaneseLexemeSummary,
  JapanesePitchPattern,
  JapaneseSearchResult,
  JapaneseStrokeData,
  JapaneseStrokeRecognitionResult,
  JapanesePracticeScore,
} from "../../shared/japaneseTypes";
import {
  getJapaneseDb,
  getJapaneseDbPath,
  getKanjiCount,
  getLastJapaneseDbConnectError,
  getLexemeCount,
  getLoadedJapaneseDbPath,
  getMetaValue,
  getStrokeKanjiCount,
  isJapaneseDbReady,
} from "./db";
import { japaneseLog } from "./japaneseLog";
import { getJapaneseLogPath, probeJapaneseDbPaths } from "./paths";
import {
  rankKanjiMatches,
  sanitizeUserStrokes,
  scoreKanjiMatch,
  type UserStrokeInput,
} from "./strokeMatch";
import { logPracticeScore } from "./practice";
import {
  getKanjiStrokeReferences,
  getKanjiStrokeReferencesForHandwriting,
  invalidateKanjiStrokeReferenceCache,
} from "./strokeReferenceCache";

export { invalidateKanjiStrokeReferenceCache };

function buildFtsQuery(query: string, mode: "exact" | "prefix"): string {
  const tokens = query
    .trim()
    .replace(/["']/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return "";
  const suffix = mode === "prefix" ? "*" : "";
  return tokens.map((token) => `"${token}"${suffix}`).join(" ");
}

function isLikelyRomaji(query: string): boolean {
  return /^[a-zA-Z\-']+$/.test(query);
}

function expandSearchQueries(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (isLikelyRomaji(trimmed)) {
    const hiragana = toHiragana(trimmed);
    if (hiragana && hiragana !== trimmed) return [hiragana, trimmed];
  }
  return [trimmed];
}

function mergeUniqueEntSeqs(limit: number, ...lists: number[][]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const list of lists) {
    for (const entSeq of list) {
      if (seen.has(entSeq)) continue;
      seen.add(entSeq);
      out.push(entSeq);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function searchExact(db: NonNullable<ReturnType<typeof getJapaneseDb>>, query: string, limit: number): number[] {
  if (!query.trim()) return [];
  const rows = db
    .prepare(
      `SELECT ent_seq FROM writing WHERE orthography = ?
       UNION
       SELECT ent_seq FROM reading WHERE kana = ?
       LIMIT ?`,
    )
    .all(query, query, limit) as { ent_seq: number }[];
  return rows.map((row) => row.ent_seq);
}

const SINGLE_KANJI_RE = /^\p{Script=Han}$/u;

/** Pick a short preview gloss; skip ambiguous KRDICT matches and single-kanji entries. */
function resolveGlossPreview(
  db: NonNullable<ReturnType<typeof getJapaneseDb>>,
  entSeq: number,
  primaryWriting: string | null,
): string | null {
  const skipKorean = primaryWriting != null && SINGLE_KANJI_RE.test(primaryWriting);

  const enRow = db
    .prepare(
      `SELECT g.text
       FROM gloss g
       JOIN sense s ON g.sense_id = s.id
       WHERE s.ent_seq = ? AND s.sense_no = 1 AND g.lang = 'en'
       ORDER BY g.id
       LIMIT 1`,
    )
    .get(entSeq) as { text: string } | undefined;

  if (skipKorean) return enRow?.text ?? null;

  const koRows = db
    .prepare(
      `SELECT DISTINCT g.text
       FROM gloss g
       JOIN sense s ON g.sense_id = s.id
       WHERE s.ent_seq = ? AND s.sense_no = 1 AND g.lang = 'ko'
       ORDER BY g.text`,
    )
    .all(entSeq) as { text: string }[];

  if (koRows.length === 1) return koRows[0].text;
  if (enRow) return enRow.text;
  if (koRows.length > 0) return koRows[0].text;

  const fallback = db
    .prepare(
      `SELECT g.text
       FROM gloss g
       JOIN sense s ON g.sense_id = s.id
       WHERE s.ent_seq = ?
       ORDER BY CASE g.lang WHEN 'en' THEN 0 WHEN 'ko' THEN 1 ELSE 2 END, s.sense_no, g.id
       LIMIT 1`,
    )
    .get(entSeq) as { text: string } | undefined;
  return fallback?.text ?? null;
}

function summarizeLexeme(db: NonNullable<ReturnType<typeof getJapaneseDb>>, entSeq: number): JapaneseLexemeSummary {
  const writing = db
    .prepare("SELECT orthography FROM writing WHERE ent_seq = ? ORDER BY id LIMIT 1")
    .get(entSeq) as { orthography: string } | undefined;
  const reading = db
    .prepare("SELECT kana FROM reading WHERE ent_seq = ? ORDER BY id LIMIT 1")
    .get(entSeq) as { kana: string } | undefined;

  return {
    entSeq,
    primaryWriting: writing?.orthography ?? null,
    primaryReading: reading?.kana ?? null,
    glossPreview: resolveGlossPreview(db, entSeq, writing?.orthography ?? null),
  };
}

function summarizeLexemeBatch(
  db: NonNullable<ReturnType<typeof getJapaneseDb>>,
  entSeqs: number[],
): JapaneseLexemeSummary[] {
  if (entSeqs.length === 0) return [];

  const placeholders = entSeqs.map(() => "?").join(",");
  const writingBySeq = new Map<number, string>();
  for (const row of db
    .prepare(`SELECT ent_seq, orthography FROM writing WHERE ent_seq IN (${placeholders}) ORDER BY id`)
    .all(...entSeqs) as { ent_seq: number; orthography: string }[]) {
    if (!writingBySeq.has(row.ent_seq)) writingBySeq.set(row.ent_seq, row.orthography);
  }

  const readingBySeq = new Map<number, string>();
  for (const row of db
    .prepare(`SELECT ent_seq, kana FROM reading WHERE ent_seq IN (${placeholders}) ORDER BY id`)
    .all(...entSeqs) as { ent_seq: number; kana: string }[]) {
    if (!readingBySeq.has(row.ent_seq)) readingBySeq.set(row.ent_seq, row.kana);
  }

  return entSeqs.map((entSeq) => ({
    entSeq,
    primaryWriting: writingBySeq.get(entSeq) ?? null,
    primaryReading: readingBySeq.get(entSeq) ?? null,
    glossPreview: resolveGlossPreview(db, entSeq, writingBySeq.get(entSeq) ?? null),
  }));
}

function searchByFts(db: NonNullable<ReturnType<typeof getJapaneseDb>>, ftsQuery: string, limit: number): number[] {
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
  let probes: ReturnType<typeof probeJapaneseDbPaths> = [];
  try {
    probes = probeJapaneseDbPaths();
  } catch (err) {
    japaneseLog("status_probe_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const primaryPath = getJapaneseDbPath();
  const loadedPath = getLoadedJapaneseDbPath();
  let path: string | null = null;
  try {
    path = primaryPath;
  } catch {
    path = null;
  }

  const ready = isJapaneseDbReady();
  const connectError = getLastJapaneseDbConnectError();
  let loadMessage: string | null = null;
  if (!ready) {
    if (connectError?.includes("NODE_MODULE_VERSION")) {
      loadMessage =
        "SQLite 네이티브 모듈이 Electron과 맞지 않습니다. 터미널에서 cd electron && npm install && npm run rebuild:native 실행 후 앱을 재시작하세요.";
    } else if (connectError) {
      loadMessage = `사전 DB 연결 실패: ${connectError}`;
    } else {
      const existing = probes.filter((probe) => probe.exists);
      if (existing.length === 0) {
        loadMessage = `dictionary.db를 찾을 수 없습니다. electron/에서 npm run japanese:import:fixtures 실행 후 Reload 하세요.`;
      } else if (existing.every((probe) => probe.lexemeCount === 0)) {
        loadMessage = `DB 파일은 있지만 비어 있습니다. npm run japanese:import:fixtures 를 다시 실행하세요.`;
      } else if (loadedPath && loadedPath !== primaryPath) {
        loadMessage = `대체 DB 사용 중: ${loadedPath} (기본 경로: ${primaryPath})`;
      } else {
        loadMessage = `사전이 연결되지 않았습니다. 아래 로그를 확인하고 Reload를 누르세요.`;
      }
    }
  }

  const status: JapaneseDbStatus = {
    ready,
    path,
    loadedPath,
    entryCount: getLexemeCount(),
    kanjiCount: getKanjiCount(),
    strokeKanjiCount: getStrokeKanjiCount(),
    importedAt: getMetaValue("imported_at"),
    loadMessage,
    logPath: getJapaneseLogPath(),
    probes,
  };
  return status;
}

export function searchJapaneseDictionary(query: string, limit = 30): JapaneseSearchResult {
  const db = getJapaneseDb();
  if (!db || !query.trim()) {
    japaneseLog("search_skip", { query, reason: db ? "empty_query" : "no_db" });
    return { query, hits: [] };
  }

  const variants = expandSearchQueries(query);
  const lists: number[][] = [];
  for (const variant of variants) {
    lists.push(searchExact(db, variant, limit));
    if (!isLikelyRomaji(variant)) {
      lists.push(searchByFts(db, buildFtsQuery(variant, "exact"), limit));
    }
  }
  const prefixVariant = variants.find((variant) => !isLikelyRomaji(variant)) ?? variants[0];
  if (prefixVariant) {
    lists.push(searchByFts(db, buildFtsQuery(prefixVariant, "prefix"), limit));
  }
  lists.push(searchBySubstring(db, variants[0] ?? query.trim(), limit));

  const entSeqs = mergeUniqueEntSeqs(limit, ...lists);
  const hits = summarizeLexemeBatch(db, entSeqs);
  japaneseLog("search", { query, hitCount: hits.length, variants });
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
    pos: (
      db
        .prepare("SELECT pos FROM sense_pos WHERE sense_id = ? ORDER BY pos")
        .all(sense.id) as { pos: string }[]
    ).map((row) => row.pos),
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
       ORDER BY e.id
       LIMIT 20`,
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
    pitchPatterns: getLexemePitchPatterns(entSeq),
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

export function recognizeJapaneseStrokes(userStrokes: UserStrokeInput[]): JapaneseStrokeRecognitionResult {
  const strokeCount = sanitizeUserStrokes(userStrokes).length;
  const pool = getKanjiStrokeReferencesForHandwriting(strokeCount);
  const candidates = rankKanjiMatches(userStrokes, pool, 12, { prefiltered: true });
  return { candidates };
}

export function scoreJapanesePractice(literal: string, userStrokes: UserStrokeInput[]): JapanesePracticeScore {
  const reference = getKanjiStrokeReferences().find((entry) => entry.literal === literal);
  if (!reference) {
    return { literal, score: 0 };
  }
  const score = scoreKanjiMatch(userStrokes, reference);
  logPracticeScore(literal, score);
  return { literal, score };
}

function getLexemePitchPatterns(entSeq: number): JapanesePitchPattern[] {
  const db = getJapaneseDb();
  if (!db) return [];
  const rows = db
    .prepare("SELECT reading, pattern FROM lexeme_pitch WHERE ent_seq = ? ORDER BY reading")
    .all(entSeq) as { reading: string; pattern: string }[];
  return rows.map((row) => ({ reading: row.reading, pattern: row.pattern }));
}
