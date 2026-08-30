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
  parseHuneumString,
  parseTatoebaLinkLine,
  parseTatoebaSentenceLine,
  findLexemeMatchesInText,
  buildLexemeSurfaceIndex,
  rebuildLexemeFts,
} from "../../../scripts/japanese/import-core.mjs";

const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "../../../test-fixtures/japanese");

describe("japanese dictionary import", () => {
  it("parses NIK JSON Japanese lemma tokens", () => {
    expect(parseJapaneseLemmaTokens("はし【端】。ふち【縁】")).toEqual([
      { writing: "端", reading: "はし" },
      { writing: "縁", reading: "ふち" },
    ]);
    expect(parseJapaneseLemmaTokens("せんえいだ【先鋭だ・尖鋭だ】")).toEqual([
      { writing: "先鋭だ", reading: "せんえいだ" },
      { writing: "尖鋭だ", reading: "せんえいだ" },
    ]);
    expect(parseJapaneseLemmaTokens("たべる")).toEqual([{ writing: "たべる", reading: "たべる" }]);
  });

  it("parses Korean 훈음 strings", () => {
    expect(parseHuneumString("불 화")).toEqual([{ hunKo: "불", eumKo: "화" }]);
    expect(parseHuneumString("밥 식/먹을 식, 먹이 사")).toEqual([
      { hunKo: "밥", eumKo: "식" },
      { hunKo: "먹을", eumKo: "식" },
      { hunKo: "먹이", eumKo: "사" },
    ]);
  });

  it("parses Tatoeba export lines without headers", () => {
    expect(parseTatoebaSentenceLine("900001\tjpn\t私は食べる。")).toEqual({
      id: 900001,
      lang: "jpn",
      text: "私は食べる。",
    });
    expect(parseTatoebaSentenceLine("id\tlang\ttext")).toBeNull();
    expect(parseTatoebaLinkLine("900001\t900002")).toEqual({ from: 900001, to: 900002 });
    expect(parseTatoebaLinkLine("from_id\tto_id")).toBeNull();
  });

  it("imports fixture JMdict and KANJIDIC into SQLite with FTS hits", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "japanese-import-"));
    const outPath = join(outDir, "dictionary.db");

    const result = await importDictionary({
      outPath,
      jmdictPath: join(fixturesDir, "jmdict-sample.xml"),
      kanjidicPath: join(fixturesDir, "kanjidic-sample.xml"),
      kanjivgPath: join(fixturesDir, "kanjivg"),
      hanjadictPath: join(fixturesDir, "hanjadict-sample.json"),
    });

    expect(result.jmdictCount).toBe(5);
    expect(result.kanjidicCount).toBe(3);
    expect(result.kanjivgCount.strokeCount).toBe(9);
    expect(result.hanjadictCount.pairCount).toBeGreaterThan(0);

    const db = openDictionaryDb(outPath);
    const lexemeCount = db.prepare("SELECT COUNT(*) AS count FROM lexeme").get() as { count: number };
    expect(lexemeCount.count).toBe(5);

    const kanjiRow = db.prepare("SELECT strokes, grade FROM kanji WHERE literal = ?").get("食") as {
      strokes: number;
      grade: number;
    };
    expect(kanjiRow.strokes).toBe(9);
    expect(kanjiRow.grade).toBe(3);

    const meanings = db
      .prepare("SELECT text FROM kanji_meaning WHERE literal = ? ORDER BY sort_order")
      .all("食") as { text: string }[];
    expect(meanings.map((row) => row.text)).toEqual(["eat", "food"]);

    const huneum = db
      .prepare("SELECT hun_ko, eum_ko FROM kanji_huneum WHERE literal = ? ORDER BY sort_order")
      .all("食") as { hun_ko: string; eum_ko: string }[];
    expect(huneum.length).toBeGreaterThan(0);
    expect(huneum[0]).toEqual({ hun_ko: "밥", eum_ko: "식" });

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
