#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importDictionary } from "./import-core.mjs";
import { defaultDictionaryDbPath } from "./paths.mjs";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/japanese");
const outPath = defaultDictionaryDbPath({ packaged: process.argv.includes("--packaged") });

const result = await importDictionary({
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

console.log(`Fixture dictionary written to ${result.outPath}`);
console.log(
  `${result.jmdictCount} words, ${result.kanjidicCount} kanji, ${result.kanjivgCount.strokeCount} strokes.`,
);
console.log("Open the Japanese pane → Data tab → Reload dictionary (or click ↻).");
