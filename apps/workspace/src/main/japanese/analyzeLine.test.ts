import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importDictionary } from "../../../scripts/japanese/import-core.mjs";
import { analyzeJapaneseLine, analyzeJapaneseReading } from "./analyzeLine";
import { setJapaneseDb } from "./db";
import { greedyDictionarySegments, isParticle, segmentJapaneseLine, splitByParticles } from "./segment";

const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "../../../test-fixtures/japanese");

describe("japanese segment", () => {
  it("splits particles from a chunk", () => {
    expect(splitByParticles("日本は")).toEqual(["日本", "は"]);
    expect(isParticle("は")).toBe(true);
    expect(isParticle("本")).toBe(false);
  });

  it("greedy-matches dictionary surfaces", () => {
    const known = new Set(["日本", "本"]);
    expect(greedyDictionarySegments("日本", (s) => known.has(s))).toEqual(["日本"]);
    expect(greedyDictionarySegments("日本本", (s) => known.has(s))).toEqual(["日本", "本"]);
  });
});

describe("japanese analyzeLine", () => {
  let outDir = "";

  beforeEach(async () => {
    outDir = mkdtempSync(join(tmpdir(), "japanese-analyze-"));
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

  it("breaks down a sentence with dictionary hits and particles", () => {
    const lookup = (surface: string) => ["日本", "食べる", "本", "食事"].includes(surface);
    expect(segmentJapaneseLine("日本は", lookup)).toEqual(["日本", "は"]);

    const result = analyzeJapaneseLine("食べる");
    expect(result.providerId).toBe("dictionary-only");
    expect(result.tokens?.[0]?.surface).toBe("食べる");
    expect(result.tokens?.[0]?.reading).toBe("たべる");
    expect(result.tokens?.[0]?.glossKo).toBe("먹다");
    expect(result.tokens?.[0]?.source).toBe("dictionary");
  });

  it("returns reading for a vocabulary line", () => {
    const result = analyzeJapaneseReading("本");
    expect(result.lines).toEqual(["ほん"]);
    expect(result.tokens?.[0]?.source).toBe("dictionary");
  });

  it("marks unknown surfaces for later LLM enrichment", () => {
    const result = analyzeJapaneseLine("あ");
    expect(result.tokens?.some((token) => token.source === "dictionary")).toBe(true);
  });
});
