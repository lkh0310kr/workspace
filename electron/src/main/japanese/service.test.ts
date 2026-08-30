import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importDictionary } from "../../../scripts/japanese/import-core.mjs";
import { setJapaneseDb } from "./db";
import {
  getJapaneseDbStatus,
  getJapaneseKanji,
  getJapaneseLexeme,
  getJapaneseStrokes,
  searchJapaneseDictionary,
} from "./service";

const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "../../../test-fixtures/japanese");

describe("japanese dictionary service", () => {
  let outDir = "";

  beforeEach(async () => {
    outDir = mkdtempSync(join(tmpdir(), "japanese-service-"));
    process.env.WORKSPACE_JAPANESE_USER_DATA = outDir;
    const outPath = join(outDir, "japanese", "dictionary.db");
    await importDictionary({
      outPath,
      jmdictPath: join(fixturesDir, "jmdict-sample.xml"),
      kanjidicPath: join(fixturesDir, "kanjidic-sample.xml"),
      kanjivgPath: join(fixturesDir, "kanjivg"),
      krdictPath: join(fixturesDir, "krdict-sample.xml"),
      tatoebaSentencesPath: join(fixturesDir, "tatoeba-sentences.tsv"),
      tatoebaLinksPath: join(fixturesDir, "tatoeba-links.tsv"),
      tatoebaLexemeLinksPath: join(fixturesDir, "tatoeba-lexeme-links.tsv"),
      kanjiumPath: join(fixturesDir, "kanjium-sample.txt"),
    });
    const { openJapaneseDb, initJapaneseSchema } = await import("./db");
    const db = openJapaneseDb(outPath);
    initJapaneseSchema(db);
    setJapaneseDb(db);
  });

  afterEach(() => {
    setJapaneseDb(null);
    delete process.env.WORKSPACE_JAPANESE_USER_DATA;
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("reports db status and searches lexemes", () => {
    const status = getJapaneseDbStatus();
    expect(status.ready).toBe(true);
    expect(status.entryCount).toBe(5);

    const result = searchJapaneseDictionary("食べる");
    expect(result.hits[0]?.entSeq).toBe(1000000);
    expect(result.hits[0]?.primaryWriting).toBe("食べる");
  });

  it("loads lexeme and kanji detail", () => {
    const lexeme = getJapaneseLexeme(1000001);
    expect(lexeme?.writings[0]?.orthography).toBe("日本");
    expect(lexeme?.readings).toHaveLength(2);
    expect(lexeme?.senses[0]?.glosses.some((gloss) => gloss.lang === "ko")).toBe(true);
    expect(lexeme?.examples.length).toBeGreaterThan(0);

    const taberu = getJapaneseLexeme(1000000);
    expect(taberu?.examples[0]?.textJa).toContain("食べる");
    expect(taberu?.pitchPatterns.some((pitch) => pitch.reading === "たべる")).toBe(true);

    const kanji = getJapaneseKanji("食");
    expect(kanji?.strokes).toBe(9);
    expect(kanji?.readings.some((reading) => reading.type === "on")).toBe(true);
    expect(kanji?.linkedLexemes.length).toBeGreaterThan(0);

    const strokes = getJapaneseStrokes("食");
    expect(strokes?.strokes).toHaveLength(9);
  });
});
