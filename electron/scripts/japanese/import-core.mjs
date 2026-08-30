import { createReadStream, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
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

/** JMdict uses DTD entities (&v1;, &unc;, …) that xml2js cannot resolve without the DTD. */
function sanitizeJmdictXml(xml) {
  const xmlEntities = new Set(["amp", "lt", "gt", "quot", "apos"]);
  return xml.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9.-]*);/g, (match, name) => {
    if (name.startsWith("#")) return match;
    if (xmlEntities.has(name.toLowerCase())) return match;
    return name;
  });
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
    DELETE FROM lexeme_pitch;
    DELETE FROM gloss;
    DELETE FROM sense_pos;
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
    for (const posNode of asArray(sense.pos)) {
      const raw = textOf(posNode).replace(/^&/, "").replace(/;$/, "");
      if (!raw) continue;
      database.prepare("INSERT INTO sense_pos (sense_id, pos) VALUES (?, ?)").run(senseId, raw);
    }
    for (const gloss of asArray(sense.gloss)) {
      const lang = gloss.$?.lang ?? "en";
      const text = textOf(gloss);
      if (!text) continue;
      database.prepare("INSERT INTO gloss (sense_id, lang, text, source) VALUES (?, ?, ?, 'jmdict')").run(senseId, lang, text);
    }
  }
}

export async function importJmdict(database, xmlPath) {
  const xml = sanitizeJmdictXml(readFileSync(xmlPath, "utf8"));
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

/** Tatoeba weekly export: id [tab] lang [tab] text (no header row). */
export function parseTatoebaSentenceLine(line) {
  if (!line?.trim()) return null;
  const firstTab = line.indexOf("\t");
  if (firstTab < 0) return null;
  const secondTab = line.indexOf("\t", firstTab + 1);
  if (secondTab < 0) return null;
  const id = Number(line.slice(0, firstTab));
  if (!Number.isFinite(id)) return null;
  return {
    id,
    lang: line.slice(firstTab + 1, secondTab),
    text: line.slice(secondTab + 1),
  };
}

/** Tatoeba links export: from_id [tab] to_id (no header row). */
export function parseTatoebaLinkLine(line) {
  if (!line?.trim()) return null;
  const tab = line.indexOf("\t");
  if (tab < 0) return null;
  const from = Number(line.slice(0, tab));
  const to = Number(line.slice(tab + 1));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from, to };
}

export function buildLexemeSurfaceIndex(database, { priorityOnly = true } = {}) {
  const sql = priorityOnly
    ? `SELECT ent_seq, orthography AS form
       FROM writing
       WHERE priority IS NOT NULL AND length(orthography) >= 2
       UNION ALL
       SELECT ent_seq, kana AS form
       FROM reading
       WHERE priority IS NOT NULL AND length(kana) >= 3`
    : `SELECT ent_seq, orthography AS form
       FROM writing
       WHERE length(orthography) >= 2
       UNION ALL
       SELECT ent_seq, kana AS form
       FROM reading
       WHERE length(kana) >= 3`;
  const byChar = new Map();
  for (const row of database.prepare(sql).all()) {
    const form = row.form;
    const ch = form[0];
    if (!ch) continue;
    if (!byChar.has(ch)) byChar.set(ch, []);
    byChar.get(ch).push({ form, entSeq: row.ent_seq, len: form.length });
  }
  for (const bucket of byChar.values()) {
    bucket.sort((a, b) => b.len - a.len);
  }
  return byChar;
}

export function findLexemeMatchesInText(text, surfaceIndex, { maxMatches = 5 } = {}) {
  if (!text || !surfaceIndex) return [];
  const seen = new Set();
  const matches = [];
  const candidates = [];
  for (const ch of new Set(text)) {
    const bucket = surfaceIndex.get(ch);
    if (bucket) candidates.push(...bucket);
  }
  candidates.sort((a, b) => b.len - a.len);
  for (const { form, entSeq } of candidates) {
    if (seen.has(entSeq)) continue;
    if (!text.includes(form)) continue;
    seen.add(entSeq);
    matches.push(entSeq);
    if (matches.length >= maxMatches) break;
  }
  return matches;
}

async function loadTatoebaJpnSentences(sentencesPath) {
  const jpnSentences = new Map();
  const rl = createInterface({ input: createReadStream(sentencesPath, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const parsed = parseTatoebaSentenceLine(line);
    if (!parsed || parsed.lang !== "jpn") continue;
    jpnSentences.set(parsed.id, parsed.text);
  }
  return jpnSentences;
}

async function loadTatoebaAdjacency(linksPath, jpnIds) {
  const adjacency = new Map();
  const neededIds = new Set();
  const rl = createInterface({ input: createReadStream(linksPath, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const parsed = parseTatoebaLinkLine(line);
    if (!parsed) continue;
    if (jpnIds.has(parsed.from)) {
      if (!adjacency.has(parsed.from)) adjacency.set(parsed.from, new Set());
      adjacency.get(parsed.from).add(parsed.to);
      neededIds.add(parsed.to);
    }
    if (jpnIds.has(parsed.to)) {
      if (!adjacency.has(parsed.to)) adjacency.set(parsed.to, new Set());
      adjacency.get(parsed.to).add(parsed.from);
      neededIds.add(parsed.from);
    }
  }
  return { adjacency, neededIds };
}

async function loadTatoebaTranslations(sentencesPath, neededIds) {
  const translations = new Map();
  const rl = createInterface({ input: createReadStream(sentencesPath, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const parsed = parseTatoebaSentenceLine(line);
    if (!parsed || !neededIds.has(parsed.id)) continue;
    if (parsed.lang !== "eng" && parsed.lang !== "kor") continue;
    translations.set(parsed.id, { lang: parsed.lang, text: parsed.text });
  }
  return translations;
}

function asFeatList(feat) {
  if (feat == null) return [];
  return asArray(feat)
    .map((item) => {
      if (item == null || typeof item !== "object" || !item.att) return null;
      return { att: String(item.att), val: textOf(item.val) };
    })
    .filter(Boolean);
}

/** Parse NIK 한국어기초사전 JSON Japanese equivalent lemma strings (e.g. はし【端】). */
export function parseJapaneseLemmaTokens(lemmaText) {
  if (!lemmaText) return [];
  const results = [];
  const seen = new Set();
  const add = (writing, reading) => {
    const w = writing?.trim() || null;
    const r = reading?.trim() || null;
    if (!w && !r) return;
    const key = `${w ?? ""}|${r ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ writing: w, reading: r });
  };

  for (const segment of lemmaText.split(/。/)) {
    const token = segment.trim().replace(/\.$/, "");
    if (!token) continue;
    const bracket = token.match(/^(.+?)【(.+?)】$/);
    if (bracket) {
      const reading = bracket[1].trim();
      const writings = bracket[2]
        .split(/[・、]/)
        .map((part) => part.trim())
        .filter(Boolean);
      add(null, reading);
      for (const writing of writings) add(writing, reading);
    } else {
      add(token, token);
    }
  }
  return results;
}

function listNikJsonFiles(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    return readdirSync(path)
      .filter((name) => name.toLowerCase().endsWith(".json"))
      .map((name) => join(path, name))
      .sort();
  }
  return [path];
}

function importKrdictNikJson(database, pathOrDir) {
  const files = listNikJsonFiles(pathOrDir);
  if (files.length === 0) throw new Error(`No JSON files found in KRDICT path: ${pathOrDir}`);

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

  const lookupEntSeqs = (token) => {
    const entSeqs = new Set();
    if (token.writing) {
      for (const row of findByOrthography.all(token.writing)) entSeqs.add(row.ent_seq);
    }
    if (token.reading) {
      for (const row of findByReading.all(token.reading)) entSeqs.add(row.ent_seq);
    }
    return [...entSeqs];
  };

  const tx = database.transaction(() => {
    for (const filePath of files) {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      const entries = asArray(parsed.LexicalResource?.Lexicon?.LexicalEntry);
      for (const entry of entries) {
        const targetCode = textOf(entry.val);
        for (const sense of asArray(entry.Sense)) {
          const definition = asFeatList(sense?.feat).find((feat) => feat.att === "definition")?.val ?? "";
          if (!definition) continue;

          for (const equivalent of asArray(sense?.Equivalent)) {
            const feats = asFeatList(equivalent?.feat);
            if (feats.find((feat) => feat.att === "language")?.val !== "일본어") continue;
            const lemma = feats.find((feat) => feat.att === "lemma")?.val ?? "";
            for (const token of parseJapaneseLemmaTokens(lemma)) {
              for (const entSeq of lookupEntSeqs(token)) {
                const senseRow = firstSense.get(entSeq);
                if (!senseRow) continue;
                const result = insertGloss.run(senseRow.id, definition);
                insertProvenance.run(String(result.lastInsertRowid), targetCode || null, now);
                glossCount += 1;
              }
            }
          }
        }
      }
    }
  });
  tx();
  return glossCount;
}

async function importKrdictXml(database, xmlPath) {
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

export async function importKrdict(database, krdictPath) {
  const resolved = resolve(krdictPath);
  if (!existsSync(resolved)) throw new Error(`KRDICT file not found: ${krdictPath}`);
  const st = statSync(resolved);
  if (st.isDirectory() || resolved.toLowerCase().endsWith(".json")) {
    return importKrdictNikJson(database, resolved);
  }
  return importKrdictXml(database, resolved);
}

export async function importTatoeba(database, sentencesPath, linksPath, lexemeLinksPath) {
  console.log("[japanese-import] tatoeba: loading Japanese sentences…");
  const jpnSentences = await loadTatoebaJpnSentences(sentencesPath);
  const jpnIds = new Set(jpnSentences.keys());
  console.log("[japanese-import] tatoeba: japanese sentences", jpnSentences.size);

  console.log("[japanese-import] tatoeba: loading translation links…");
  const { adjacency, neededIds } = await loadTatoebaAdjacency(linksPath, jpnIds);
  console.log("[japanese-import] tatoeba: loading eng/kor translations…");
  const translations = await loadTatoebaTranslations(sentencesPath, neededIds);

  const lexemeLinks = lexemeLinksPath && existsSync(lexemeLinksPath)
    ? parseTsv(readFileSync(lexemeLinksPath, "utf8"))
    : { rows: [] };

  const curatedSentenceMap = new Map();
  for (const row of lexemeLinks.rows) {
    const jpnId = Number(row.tatoeba_jpn_id);
    const entSeq = Number(row.ent_seq);
    if (!Number.isFinite(jpnId) || !Number.isFinite(entSeq)) continue;
    if (!curatedSentenceMap.has(jpnId)) curatedSentenceMap.set(jpnId, []);
    curatedSentenceMap.get(jpnId).push(entSeq);
  }

  const surfaceIndex = buildLexemeSurfaceIndex(database);
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
  let linkCount = 0;
  let processed = 0;
  const tx = database.transaction(() => {
    for (const [jpnId, textJa] of jpnSentences) {
      processed += 1;
      const linkedIds = adjacency.get(jpnId);
      let textEn = null;
      let textKo = null;
      if (linkedIds) {
        for (const linkedId of linkedIds) {
          const linked = translations.get(linkedId);
          if (!linked) continue;
          if (linked.lang === "eng" && !textEn) textEn = linked.text;
          if (linked.lang === "kor" && !textKo) textKo = linked.text;
        }
      }

      const curated = curatedSentenceMap.get(jpnId);
      const autoEntSeqs = findLexemeMatchesInText(textJa, surfaceIndex);
      if (!curated && !autoEntSeqs.length && !textEn && !textKo) continue;

      const result = insertExample.run(jpnId, textJa, textEn, textKo);
      const exampleId = result.lastInsertRowid;
      exampleCount += 1;

      const entSeqs = new Set([...(curated ?? []), ...autoEntSeqs]);
      for (const entSeq of entSeqs) {
        linkLexeme.run(entSeq, exampleId);
        linkCount += 1;
      }

      if (processed % 25000 === 0) {
        console.log("[japanese-import] tatoeba: processed", processed, "examples", exampleCount, "links", linkCount);
      }
    }
  });
  tx();
  console.log("[japanese-import] tatoeba: done", { exampleCount, linkCount });
  return exampleCount;
}

export function importKanjium(database, accentsPath) {
  const lines = readFileSync(accentsPath, "utf8").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const findByReading = database.prepare(`SELECT DISTINCT ent_seq FROM reading WHERE kana = ?`);
  const upsert = database.prepare(
    `INSERT OR REPLACE INTO lexeme_pitch (ent_seq, reading, pattern, source) VALUES (?, ?, ?, 'kanjium')`,
  );
  let count = 0;
  const tx = database.transaction(() => {
    for (const line of lines) {
      const parts = line.split("\t");
      let reading;
      let pattern;
      if (parts.length >= 3) {
        reading = parts[1]?.trim();
        pattern = parts[2]?.trim();
      } else {
        reading = parts[0]?.trim();
        pattern = parts[1]?.trim();
      }
      if (!reading || !pattern) continue;
      const entSeqs = findByReading.all(reading).map((row) => row.ent_seq);
      for (const entSeq of entSeqs) {
        upsert.run(entSeq, reading, pattern);
        count += 1;
      }
    }
  });
  tx();
  return count;
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
  kanjiumPath,
  clear = true,
}) {
  if (!outPath) throw new Error("--out is required");
  if (!jmdictPath && !kanjidicPath && !kanjivgPath && !krdictPath && !tatoebaSentencesPath && !kanjiumPath) {
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
  if (kanjiumPath && !existsSync(kanjiumPath)) throw new Error(`Kanjium accents file not found: ${kanjiumPath}`);

  const database = openDictionaryDb(resolve(outPath));
  initSchema(database);
  if (clear) clearDictionaryData(database);

  let jmdictCount = 0;
  let kanjidicCount = 0;
  let kanjivgCount = { fileCount: 0, strokeCount: 0 };
  let krdictCount = 0;
  let tatoebaCount = 0;
  let kanjiumCount = 0;
  if (jmdictPath) jmdictCount = await importJmdict(database, jmdictPath);
  if (kanjidicPath) kanjidicCount = await importKanjidic(database, kanjidicPath);
  if (kanjivgPath) kanjivgCount = importKanjivg(database, kanjivgPath);
  if (krdictPath) krdictCount = await importKrdict(database, krdictPath);
  if (tatoebaSentencesPath && tatoebaLinksPath) {
    tatoebaCount = await importTatoeba(database, tatoebaSentencesPath, tatoebaLinksPath, tatoebaLexemeLinksPath);
  }
  if (kanjiumPath) kanjiumCount = importKanjium(database, kanjiumPath);
  rebuildLexemeFts(database);

  setMeta(database, "schema_version", "1");
  setMeta(database, "imported_at", new Date().toISOString());
  if (jmdictPath) setMeta(database, "jmdict_path", resolve(jmdictPath));
  if (kanjidicPath) setMeta(database, "kanjidic_path", resolve(kanjidicPath));
  if (kanjivgPath) setMeta(database, "kanjivg_path", resolve(kanjivgPath));
  if (krdictPath) setMeta(database, "krdict_path", resolve(krdictPath));
  if (tatoebaSentencesPath) setMeta(database, "tatoeba_sentences_path", resolve(tatoebaSentencesPath));

  database.close();
  console.log("[japanese-import] complete", {
    outPath: resolve(outPath),
    jmdictCount,
    kanjidicCount,
    kanjivgCount,
    krdictCount,
    tatoebaCount,
    kanjiumCount,
  });
  return {
    jmdictCount,
    kanjidicCount,
    kanjivgCount,
    krdictCount,
    tatoebaCount,
    kanjiumCount,
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
    kanjiumPath: null,
    packaged: false,
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
    else if (arg === "--kanjium") args.kanjiumPath = argv[++i];
    else if (arg === "--packaged") args.packaged = true;
    else if (arg === "--no-clear") args.clear = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}
