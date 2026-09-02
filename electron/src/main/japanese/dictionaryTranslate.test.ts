import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importDictionary } from "../../../scripts/japanese/import-core.mjs";
import { setJapaneseDb } from "./db";
import { tryDictionaryTranslateToJa, tryDictionaryTranslateToKo } from "./dictionaryTranslate";

const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "../../../test-fixtures/japanese");

describe("dictionaryTranslate", () => {
  let outDir = "";

  beforeEach(async () => {
    outDir = mkdtempSync(join(tmpdir(), "japanese-dict-translate-"));
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
      hanjadictPath: join(fixturesDir, "hanjadict-sample.json"),
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

  it("translates Japanese lexeme to Korean without LLM", () => {
    expect(tryDictionaryTranslateToKo("食べる")).toBe("먹다");
  });

  it("translates Korean gloss to Japanese writing without LLM", () => {
    expect(tryDictionaryTranslateToJa("먹다")).toBe("食べる");
  });
});
