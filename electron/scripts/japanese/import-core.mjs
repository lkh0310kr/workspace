import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
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
  mkdirSync(dirname(outPath), { recursive: true });
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
    DELETE FROM lexeme_example;
    DELETE FROM example;
    DELETE FROM field_provenance;
    DELETE FROM gloss;
    DELETE FROM sense;
    DELETE FROM reading;
    DELETE FROM writing;
    DELETE FROM kanji_stroke;
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

const KANJIVG_PATH_REGEX = /<path[^>]*id="kvg:[^"]*-s(\d+)"[^>]*d="([^"]+)"/g;

function literalFromKanjivgFilename(fileName) {
  const base = fileName.replace(/\.svg$/i, "");
  if (!/^[0-9a-f]{4,5}$/i.test(base)) return null;
  const codepoint = Number.parseInt(base, 16);
  if (!Number.isFinite(codepoint)) return null;
  return String.fromCodePoint(codepoint);
}

function parseKanjivgSvg(xml, fallbackLiteral) {
  const strokes = [];
  let match = KANJIVG_PATH_REGEX.exec(xml);
  while (match) {
    strokes.push({ order: Number(match[1]), path: match[2] });
    match = KANJIVG_PATH_REGEX.exec(xml);
  }
  strokes.sort((a, b) => a.order - b.order);

  const elementMatch = xml.match(/kvg:element="([^"]+)"/);
  const literal = fallbackLiteral ?? elementMatch?.[1] ?? null;
  if (!literal || strokes.length === 0) return null;
  return { literal, strokes };
}

function collectKanjivgSvgFiles(rootPath) {
  const stat = statSync(rootPath);
  if (stat.isFile() && rootPath.toLowerCase().endsWith(".svg")) return [rootPath];
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(rootPath)) {
    const fullPath = join(rootPath, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) {
      files.push(...collectKanjivgSvgFiles(fullPath));
    } else if (entry.toLowerCase().endsWith(".svg")) {
      files.push(fullPath);
    }
  }
  return files;
}

export function importKanjivg(database, kanjivgPath) {
  const files = collectKanjivgSvgFiles(resolve(kanjivgPath));
  const insert = database.prepare(
    "INSERT OR REPLACE INTO kanji_stroke (literal, stroke_order, path) VALUES (?, ?, ?)",
  );
  const ensureKanji = database.prepare("INSERT OR IGNORE INTO kanji (literal) VALUES (?)");
  let strokeCount = 0;
  const tx = database.transaction(() => {
    for (const filePath of files) {
      const xml = readFileSync(filePath, "utf8");
      const fallbackLiteral = literalFromKanjivgFilename(filePath.split(/[\\/]/).pop() ?? "");
      const parsed = parseKanjivgSvg(xml, fallbackLiteral);
      if (!parsed) continue;
      ensureKanji.run(parsed.literal);
      database.prepare("DELETE FROM kanji_stroke WHERE literal = ?").run(parsed.literal);
      for (const stroke of parsed.strokes) {
        insert.run(parsed.literal, stroke.order, stroke.path);
        strokeCount += 1;
      }
    }
  });
  tx();
  return { fileCount: files.length, strokeCount };
}

function parseTsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split("\t");
  const rows = lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = cells[i] ?? "";
    }
    return row;
  });
  return { headers, rows };
}

export async function importKrdict(database, xmlPath) {
  const xml = readFileSync(xmlPath, "utf8");
  const parsed = await parseStringPromise(xml, { explicitArray: true, trim: true });
  const items = asArray(parsed.channel?.item);
  const findByOrthography = database.prepare(`SELECT DISTINCT ent_seq FROM writing WHERE orthography = ?`);
  const findByReading = database.prepare(`SELECT DISTINCT ent_seq FROM reading WHERE kana = ?`);
  const firstSense = database.prepare(`SELECT id FROM sense WHERE ent_seq = ? ORDER BY sense_no LIMIT 1`);
  const insertGloss = database.prepare(
    `INSERT INTO gloss (sense_id, lang, text, source) VALUES (?, 'ko', ?, 'krdict')`,
  );
  const insertProvenance = database.prepare(
    `INSERT INTO field_provenance (entity_type, entity_id, field_name, source, external_id, updated_at)
     VALUES ('gloss', ?, 'text', 'krdict', ?, ?)`,
  );
  const now = new Date().toISOString();
  let glossCount = 0;

  const tx = database.transaction(() => {
    for (const item of items) {
      const word = textOf(item.origin_word?.[0]);
      const targetCode = textOf(item.target_code?.[0]);
      const translations = asArray(item.translation)
        .map((entry) => ({
          lang: entry.$?.language ?? "ko",
          text: textOf(entry),
        }))
        .filter((entry) => entry.lang === "ko" && entry.text);
      if (!word || translations.length === 0) continue;

      const entSeqs = [
        ...findByOrthography.all(word).map((row) => row.ent_seq),
        ...findByReading.all(word).map((row) => row.ent_seq),
      ];
      const uniqueEntSeqs = [...new Set(entSeqs)];
      for (const entSeq of uniqueEntSeqs) {
        const sense = firstSense.get(entSeq);
        if (!sense) continue;
        for (const translation of translations) {
          const result = insertGloss.run(sense.id, translation.text);
          insertProvenance.run(String(result.lastInsertRowid), targetCode || null, now);
          glossCount += 1;
        }
      }
    }
  });
  tx();
  return glossCount;
}

export function importTatoeba(database, sentencesPath, linksPath, lexemeLinksPath) {
  const sentences = parseTsv(readFileSync(sentencesPath, "utf8"));
  const links = parseTsv(readFileSync(linksPath, "utf8"));
  const lexemeLinks = lexemeLinksPath && existsSync(lexemeLinksPath)
    ? parseTsv(readFileSync(lexemeLinksPath, "utf8"))
    : { rows: [] };

  const sentenceMap = new Map();
  for (const row of sentences.rows) {
    sentenceMap.set(Number(row.id), { lang: row.lang, text: row.text });
  }

  const adjacency = new Map();
  for (const row of links.rows) {
    const from = Number(row.from_id ?? row.jpn_id);
    const to = Number(row.to_id ?? row.eng_id);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  }

  const insertExample = database.prepare(
    `INSERT INTO example (tatoeba_id, text_ja, text_en, text_ko)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tatoeba_id) DO UPDATE SET
       text_ja = excluded.text_ja,
       text_en = excluded.text_en,
       text_ko = excluded.text_ko`,
  );
  const linkLexeme = database.prepare(
    `INSERT OR IGNORE INTO lexeme_example (ent_seq, example_id) VALUES (?, ?)`,
  );

  let exampleCount = 0;
  const tx = database.transaction(() => {
    for (const row of lexemeLinks.rows) {
      const entSeq = Number(row.ent_seq);
      const jpnId = Number(row.tatoeba_jpn_id);
      const jpn = sentenceMap.get(jpnId);
      if (!Number.isFinite(entSeq) || !jpn || jpn.lang !== "jpn") continue;

      const linkedIds = adjacency.get(jpnId) ?? new Set();
      let textEn = null;
      let textKo = null;
      for (const linkedId of linkedIds) {
        const linked = sentenceMap.get(linkedId);
        if (!linked) continue;
        if (linked.lang === "eng" && !textEn) textEn = linked.text;
        if (linked.lang === "kor" && !textKo) textKo = linked.text;
      }

      const result = insertExample.run(jpnId, jpn.text, textEn, textKo);
      const exampleId = result.lastInsertRowid;
      linkLexeme.run(entSeq, exampleId);
      exampleCount += 1;
    }
  });
  tx();
  return exampleCount;
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

export async function importDictionary({
  outPath,
  jmdictPath,
  kanjidicPath,
  kanjivgPath,
  krdictPath,
  tatoebaSentencesPath,
  tatoebaLinksPath,
  tatoebaLexemeLinksPath,
  clear = true,
}) {
  if (!outPath) throw new Error("--out is required");
  if (!jmdictPath && !kanjidicPath && !kanjivgPath && !krdictPath && !tatoebaSentencesPath) {
    throw new Error("At least one import source is required");
  }
  if (jmdictPath && !existsSync(jmdictPath)) throw new Error(`JMdict file not found: ${jmdictPath}`);
  if (kanjidicPath && !existsSync(kanjidicPath)) throw new Error(`KANJIDIC file not found: ${kanjidicPath}`);
  if (kanjivgPath && !existsSync(kanjivgPath)) throw new Error(`KanjiVG path not found: ${kanjivgPath}`);
  if (krdictPath && !existsSync(krdictPath)) throw new Error(`KRDICT file not found: ${krdictPath}`);
  if (tatoebaSentencesPath && !existsSync(tatoebaSentencesPath)) {
    throw new Error(`Tatoeba sentences file not found: ${tatoebaSentencesPath}`);
  }
  if (tatoebaLinksPath && !existsSync(tatoebaLinksPath)) {
    throw new Error(`Tatoeba links file not found: ${tatoebaLinksPath}`);
  }

  const database = openDictionaryDb(resolve(outPath));
  initSchema(database);
  if (clear) clearDictionaryData(database);

  let jmdictCount = 0;
  let kanjidicCount = 0;
  let kanjivgCount = { fileCount: 0, strokeCount: 0 };
  let krdictCount = 0;
  let tatoebaCount = 0;
  if (jmdictPath) jmdictCount = await importJmdict(database, jmdictPath);
  if (kanjidicPath) kanjidicCount = await importKanjidic(database, kanjidicPath);
  if (kanjivgPath) kanjivgCount = importKanjivg(database, kanjivgPath);
  if (krdictPath) krdictCount = await importKrdict(database, krdictPath);
  if (tatoebaSentencesPath && tatoebaLinksPath) {
    tatoebaCount = importTatoeba(database, tatoebaSentencesPath, tatoebaLinksPath, tatoebaLexemeLinksPath);
  }
  rebuildLexemeFts(database);

  setMeta(database, "schema_version", "1");
  setMeta(database, "imported_at", new Date().toISOString());
  if (jmdictPath) setMeta(database, "jmdict_path", resolve(jmdictPath));
  if (kanjidicPath) setMeta(database, "kanjidic_path", resolve(kanjidicPath));
  if (kanjivgPath) setMeta(database, "kanjivg_path", resolve(kanjivgPath));
  if (krdictPath) setMeta(database, "krdict_path", resolve(krdictPath));
  if (tatoebaSentencesPath) setMeta(database, "tatoeba_sentences_path", resolve(tatoebaSentencesPath));

  database.close();
  return {
    jmdictCount,
    kanjidicCount,
    kanjivgCount,
    krdictCount,
    tatoebaCount,
    outPath: resolve(outPath),
  };
}

export function parseCliArgs(argv) {
  const args = {
    outPath: null,
    jmdictPath: null,
    kanjidicPath: null,
    kanjivgPath: null,
    krdictPath: null,
    tatoebaSentencesPath: null,
    tatoebaLinksPath: null,
    tatoebaLexemeLinksPath: null,
    clear: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.outPath = argv[++i];
    else if (arg === "--jmdict") args.jmdictPath = argv[++i];
    else if (arg === "--kanjidic") args.kanjidicPath = argv[++i];
    else if (arg === "--kanjivg") args.kanjivgPath = argv[++i];
    else if (arg === "--krdict") args.krdictPath = argv[++i];
    else if (arg === "--tatoeba-sentences") args.tatoebaSentencesPath = argv[++i];
    else if (arg === "--tatoeba-links") args.tatoebaLinksPath = argv[++i];
    else if (arg === "--tatoeba-lexeme-links") args.tatoebaLexemeLinksPath = argv[++i];
    else if (arg === "--no-clear") args.clear = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}
