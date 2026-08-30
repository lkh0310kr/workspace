#!/usr/bin/env node
import { importDictionary, parseCliArgs } from "./import-core.mjs";

const args = parseCliArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: npm run japanese:import -- [options]

Options:
  --out <path>         Output SQLite database path (required)
  --jmdict <path>      JMdict XML file
  --kanjidic <path>    KANJIDIC2 XML file
  --kanjivg <path>     KanjiVG directory or single .svg file
  --krdict <path>      KRDICT XML file
  --tatoeba-sentences <path>  Tatoeba sentences TSV
  --tatoeba-links <path>      Tatoeba links TSV (from_id, to_id)
  --tatoeba-lexeme-links <path>  Curated ent_seq to Tatoeba jpn id TSV
  --kanjium <path>         Kanjium accents.txt pitch patterns
  --no-clear           Append without clearing existing rows
  -h, --help           Show this help

Example:
  npm run japanese:import -- \\
    --jmdict /path/to/JMdict_e.xml \\
    --kanjidic /path/to/kanjidic2.xml \\
    --out ~/.config/workspace-app/japanese/dictionary.db
`);
  process.exit(0);
}

try {
  const result = await importDictionary(args);
  console.log(
    `Imported ${result.jmdictCount} JMdict entries, ${result.kanjidicCount} kanji, ${result.kanjivgCount.strokeCount} strokes, ${result.krdictCount} KR glosses, ${result.tatoebaCount} examples, and ${result.kanjiumCount} pitch patterns.`,
  );
  console.log(`Database written to ${result.outPath}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
