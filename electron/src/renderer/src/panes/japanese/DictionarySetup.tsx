import { useEffect } from "react";
import { useJapaneseDb } from "./useJapaneseDb";

const DATA_SOURCES = [
  { name: "JMdict", url: "https://www.edrdg.org/jmdict/j_jmdict.html", flag: "--jmdict" },
  { name: "KANJIDIC2", url: "https://www.edrdg.org/wiki/index.php?title=KANJIDIC_Project", flag: "--kanjidic" },
  { name: "KanjiVG", url: "https://kanjivg.tagaini.net/", flag: "--kanjivg" },
  { name: "KRDICT", url: "https://krdict.korean.go.kr/", flag: "--krdict" },
  { name: "Tatoeba", url: "https://tatoeba.org/en/downloads", flag: "--tatoeba-sentences / --tatoeba-links" },
  { name: "Kanjium", url: "https://github.com/mifunetoshiro/kanjium", flag: "--kanjium" },
];

function buildImportCommand(dbPath: string | null): string {
  const out = dbPath ?? "~/.config/workspace-app-dev/japanese/dictionary.db";
  return `cd electron
npm run japanese:import -- \\
  --jmdict /path/to/JMdict_e.xml \\
  --kanjidic /path/to/kanjidic2.xml \\
  --kanjivg /path/to/kanjivg \\
  --krdict /path/to/krdict.xml \\
  --tatoeba-sentences /path/to/sentences.tsv \\
  --tatoeba-links /path/to/links.tsv \\
  --tatoeba-lexeme-links /path/to/lexeme-links.tsv \\
  --kanjium /path/to/accents.txt \\
  --out ${out}`;
}

interface Props {
  onReady?: () => void;
}

export function DictionarySetup({ onReady }: Props) {
  const { status, loading, reloading, reload } = useJapaneseDb();

  useEffect(() => {
    if (status?.ready) onReady?.();
  }, [status?.ready, onReady]);

  if (loading && !status) {
    return <div className="japanese-pane-detail-empty">Checking dictionary…</div>;
  }

  if (status?.ready) {
    return (
      <div className="japanese-setup-ready">
        <p className="japanese-setup-lead">
          Dictionary loaded — {status.entryCount.toLocaleString()} words, {status.kanjiCount.toLocaleString()} kanji
          {status.strokeKanjiCount > 0 ? `, ${status.strokeKanjiCount.toLocaleString()} with strokes` : ""}.
        </p>
        {status.importedAt ? (
          <p className="japanese-pane-toolbar-hint">
            Last import: {new Date(status.importedAt).toLocaleString()}
          </p>
        ) : null}
        <p className="japanese-pane-toolbar-hint">DB: {status.path}</p>
        <button type="button" className="japanese-stroke-btn" onClick={() => void reload()} disabled={reloading}>
          {reloading ? "Reloading…" : "Reload dictionary"}
        </button>
      </div>
    );
  }

  return (
    <div className="japanese-setup">
      <h2 className="japanese-setup-title">Load Japanese dictionary data</h2>
      <p className="japanese-setup-lead">
        The app reads a local SQLite file built from open dictionary sources. Nothing is bundled in git — you
        download XML/TSV once, then import with the CLI.
      </p>

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">1. Quick try (dev fixtures)</h3>
        <pre className="japanese-pane-import-hint">cd electron{"\n"}npm run japanese:import:fixtures</pre>
        <p className="japanese-pane-toolbar-hint">
          Imports the small sample under <code>test-fixtures/japanese/</code> (~5 words). Good for smoke testing.
        </p>
      </section>

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">2. Full import</h3>
        <p className="japanese-setup-lead">
          Download sources below, replace <code>/path/to/…</code>, then run. Omit optional flags you do not have.
        </p>
        <pre className="japanese-pane-import-hint">{buildImportCommand(status?.path ?? null)}</pre>
        <p className="japanese-pane-toolbar-hint">
          Default output (dev): <code>~/.config/workspace-app-dev/japanese/dictionary.db</code>
          <br />
          Packaged app: <code>~/.config/workspace-app/japanese/dictionary.db</code> — pass{" "}
          <code>--packaged</code> to the import script.
        </p>
      </section>

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">3. Reload in app</h3>
        <p className="japanese-setup-lead">
          After import finishes, click reload — no app restart needed.
        </p>
        <button type="button" className="japanese-stroke-btn" onClick={() => void reload()} disabled={reloading}>
          {reloading ? "Reloading…" : "Reload dictionary"}
        </button>
        {status?.path ? <p className="japanese-pane-toolbar-hint">Expected DB: {status.path}</p> : null}
      </section>

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">Data sources</h3>
        <ul className="japanese-source-list">
          {DATA_SOURCES.map((source) => (
            <li key={source.name}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name}
              </a>
              <span className="japanese-source-flag">{source.flag}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
