import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  clearDictionaryData,
  importDictionary,
  initSchema,
  openDictionaryDb,
  parseJapaneseLemmaTokens,
  rebuildLexemeFts,
} from "../../../scripts/japanese/import-core.mjs";

const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "../../../test-fixtures/japanese");

describe("japanese dictionary import", () => {
  it("parses NIK JSON Japanese lemma tokens", () => {
    expect(parseJapaneseLemmaTokens("はし【端】。ふち【縁】")).toEqual([
      { writing: null, reading: "はし" },
      { writing: "端", reading: "はし" },
      { writing: null, reading: "ふち" },
      { writing: "縁", reading: "ふち" },
    ]);
    expect(parseJapaneseLemmaTokens("せんえいだ【先鋭だ・尖鋭だ】")).toEqual([
      { writing: null, reading: "せんえいだ" },
      { writing: "先鋭だ", reading: "せんえいだ" },
      { writing: "尖鋭だ", reading: "せんえいだ" },
    ]);
  });

  it("imports fixture JMdict and KANJIDIC into SQLite with FTS hits", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "japanese-import-"));
    const outPath = join(outDir, "dictionary.db");

    const result = await importDictionary({
      outPath,
      jmdictPath: join(fixturesDir, "jmdict-sample.xml"),
      kanjidicPath: join(fixturesDir, "kanjidic-sample.xml"),
      kanjivgPath: join(fixturesDir, "kanjivg"),
    });

    expect(result.jmdictCount).toBe(5);
    expect(result.kanjidicCount).toBe(3);
    expect(result.kanjivgCount.strokeCount).toBe(9);

    const db = openDictionaryDb(outPath);
    const lexemeCount = db.prepare("SELECT COUNT(*) AS count FROM lexeme").get() as { count: number };
    expect(lexemeCount.count).toBe(5);

    const kanjiRow = db.prepare("SELECT strokes, grade FROM kanji WHERE literal = ?").get("食") as {
      strokes: number;
      grade: number;
    };
    expect(kanjiRow.strokes).toBe(9);
    expect(kanjiRow.grade).toBe(3);

    const ftsHit = db
      .prepare(
        `SELECT ent_seq FROM lexeme_fts WHERE lexeme_fts MATCH ? LIMIT 1`,
      )
      .get("食べる") as { ent_seq: number } | undefined;
    expect(ftsHit?.ent_seq).toBe(1000000);

    db.close();
    rmSync(outDir, { recursive: true, force: true });
  });

  it("rebuilds FTS after incremental import", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "japanese-import-"));
    const outPath = join(outDir, "dictionary.db");
    const db = openDictionaryDb(outPath);
    initSchema(db);
    clearDictionaryData(db);
    db.close();

    await importDictionary({
      outPath,
      jmdictPath: join(fixturesDir, "jmdict-sample.xml"),
      clear: false,
    });

    const reopened = openDictionaryDb(outPath);
    rebuildLexemeFts(reopened);
    const hit = reopened
      .prepare(`SELECT ent_seq FROM lexeme_fts WHERE lexeme_fts MATCH ? LIMIT 1`)
      .get("日本") as { ent_seq: number } | undefined;
    expect(hit?.ent_seq).toBe(1000001);
    reopened.close();
    rmSync(outDir, { recursive: true, force: true });
  });
});
