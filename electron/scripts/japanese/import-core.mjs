import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { parseStringPromise } from "xml2js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "../../src/main/japanese/schema.sql");

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "object" && "_" in node) return String(node._);
  return String(node);
}

export function getSchemaSql() {
  return readFileSync(SCHEMA_PATH, "utf8");
}

export function openDictionaryDb(outPath) {
  const database = new Database(outPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

export function initSchema(database) {
  database.exec(getSchemaSql());
}

export function clearDictionaryData(database) {
  database.exec(`
    DELETE FROM lexeme_fts;
    DELETE FROM gloss;
    DELETE FROM sense;
    DELETE FROM reading;
    DELETE FROM writing;
    DELETE FROM kanji_reading;
    DELETE FROM kanji;
    DELETE FROM lexeme;
    DELETE FROM meta;
  `);
}

function insertLexemeEntry(database, entry) {
  const entSeq = Number(textOf(entry.ent_seq?.[0]));
  if (!Number.isFinite(entSeq)) return;

  database.prepare("INSERT OR REPLACE INTO lexeme (ent_seq) VALUES (?)").run(entSeq);

  for (const kEle of asArray(entry.k_ele)) {
    const orthography = textOf(kEle.keb?.[0]);
    if (!orthography) continue;
    const priority = asArray(kEle.ke_pri).map(textOf).join(",");
    database
      .prepare("INSERT INTO writing (ent_seq, orthography, priority) VALUES (?, ?, ?)")
      .run(entSeq, orthography, priority || null);
  }

  for (const rEle of asArray(entry.r_ele)) {
    const kana = textOf(rEle.reb?.[0]);
    if (!kana) continue;
    const priority = asArray(rEle.re_pri).map(textOf).join(",");
    database.prepare("INSERT INTO reading (ent_seq, kana, priority) VALUES (?, ?, ?)").run(entSeq, kana, priority || null);
  }

  let senseNo = 0;
  for (const sense of asArray(entry.sense)) {
    senseNo += 1;
    const result = database
      .prepare("INSERT INTO sense (ent_seq, sense_no) VALUES (?, ?)")
      .run(entSeq, senseNo);
    const senseId = result.lastInsertRowid;
    for (const gloss of asArray(sense.gloss)) {
      const lang = gloss.$?.lang ?? "en";
      const text = textOf(gloss);
      if (!text) continue;
      database.prepare("INSERT INTO gloss (sense_id, lang, text, source) VALUES (?, ?, ?, 'jmdict')").run(senseId, lang, text);
    }
  }
}

export async function importJmdict(database, xmlPath) {
  const xml = readFileSync(xmlPath, "utf8");
  const parsed = await parseStringPromise(xml, { explicitArray: true, trim: true });
  const entries = asArray(parsed.JMdict?.entry);
  const tx = database.transaction(() => {
    for (const entry of entries) {
      insertLexemeEntry(database, entry);
    }
  });
  tx();
  return entries.length;
}

function insertKanjiCharacter(database, character) {
  const literal = textOf(character.literal?.[0]);
  if (!literal) return;

  const cpValues = asArray(character.codepoint?.[0]?.cp_value);
  const ucs = cpValues.find((cp) => cp.$?.cp_type === "ucs");
  const codepoint = ucs ? Number(textOf(ucs)) : literal.codePointAt(0) ?? null;

  const misc = character.misc?.[0] ?? {};
  const strokes = misc.stroke_count?.[0] ? Number(textOf(misc.stroke_count[0])) : null;
  const grade = misc.grade?.[0] ? Number(textOf(misc.grade[0])) : null;
  const jlpt = misc.jlpt?.[0] ? Number(textOf(misc.jlpt[0])) : null;

  database
    .prepare(
      "INSERT OR REPLACE INTO kanji (literal, codepoint, strokes, grade, jlpt) VALUES (?, ?, ?, ?, ?)",
    )
    .run(literal, codepoint, strokes, grade, jlpt);

  database.prepare("DELETE FROM kanji_reading WHERE literal = ?").run(literal);

  for (const rm of asArray(character.reading_meaning)) {
    for (const group of asArray(rm.rmgroup)) {
      for (const reading of asArray(group.reading)) {
        const rType = reading.$?.r_type ?? "";
        const type = rType === "ja_on" ? "on" : rType === "ja_kun" ? "kun" : null;
        if (!type) continue;
        const text = textOf(reading);
        if (!text) continue;
        database.prepare("INSERT INTO kanji_reading (literal, type, text) VALUES (?, ?, ?)").run(literal, type, text);
      }
    }
  }
}

export async function importKanjidic(database, xmlPath) {
  const xml = readFileSync(xmlPath, "utf8");
  const parsed = await parseStringPromise(xml, { explicitArray: true, trim: true });
  const characters = asArray(parsed.kanjidic2?.character);
  const tx = database.transaction(() => {
    for (const character of characters) {
      insertKanjiCharacter(database, character);
    }
  });
  tx();
  return characters.length;
}

export function rebuildLexemeFts(database) {
  database.exec("DELETE FROM lexeme_fts");
  database.exec(`
    INSERT INTO lexeme_fts (ent_seq, search_text)
    SELECT
      l.ent_seq,
      trim(
        coalesce((SELECT group_concat(orthography, ' ') FROM writing w WHERE w.ent_seq = l.ent_seq), '') || ' ' ||
        coalesce((SELECT group_concat(kana, ' ') FROM reading r WHERE r.ent_seq = l.ent_seq), '') || ' ' ||
        coalesce((
          SELECT group_concat(g.text, ' ')
          FROM gloss g
          JOIN sense s ON g.sense_id = s.id
          WHERE s.ent_seq = l.ent_seq
        ), '')
      )
    FROM lexeme l
  `);
}

export function setMeta(database, key, value) {
  database
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export async function importDictionary({ outPath, jmdictPath, kanjidicPath, clear = true }) {
  if (!outPath) throw new Error("--out is required");
  if (!jmdictPath && !kanjidicPath) {
    throw new Error("At least one of --jmdict or --kanjidic is required");
  }
  if (jmdictPath && !existsSync(jmdictPath)) throw new Error(`JMdict file not found: ${jmdictPath}`);
  if (kanjidicPath && !existsSync(kanjidicPath)) throw new Error(`KANJIDIC file not found: ${kanjidicPath}`);

  const database = openDictionaryDb(resolve(outPath));
  initSchema(database);
  if (clear) clearDictionaryData(database);

  let jmdictCount = 0;
  let kanjidicCount = 0;
  if (jmdictPath) jmdictCount = await importJmdict(database, jmdictPath);
  if (kanjidicPath) kanjidicCount = await importKanjidic(database, kanjidicPath);
  rebuildLexemeFts(database);

  setMeta(database, "schema_version", "1");
  setMeta(database, "imported_at", new Date().toISOString());
  if (jmdictPath) setMeta(database, "jmdict_path", resolve(jmdictPath));
  if (kanjidicPath) setMeta(database, "kanjidic_path", resolve(kanjidicPath));

  database.close();
  return { jmdictCount, kanjidicCount, outPath: resolve(outPath) };
}

export function parseCliArgs(argv) {
  const args = { outPath: null, jmdictPath: null, kanjidicPath: null, clear: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.outPath = argv[++i];
    else if (arg === "--jmdict") args.jmdictPath = argv[++i];
    else if (arg === "--kanjidic") args.kanjidicPath = argv[++i];
    else if (arg === "--no-clear") args.clear = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}
