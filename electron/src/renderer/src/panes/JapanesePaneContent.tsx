import type { PaneTabItem } from "../layout/paneTypes";

interface Props {
  item: PaneTabItem;
}

export function JapanesePaneContent({ item: _item }: Props) {
  return (
    <div className="japanese-pane">
      <div className="japanese-pane-toolbar">
        <input
          className="japanese-pane-search"
          type="search"
          placeholder="Search words, readings, or kanji…"
          disabled
          aria-label="Japanese dictionary search"
        />
      </div>
      <div className="japanese-pane-body">
        <p className="japanese-pane-empty">
          Dictionary not loaded yet. Import JMdict and KANJIDIC2:
        </p>
        <pre className="japanese-pane-import-hint">
          cd electron{"\n"}
          npm run japanese:import -- \{"\n"}
          {"  "}--jmdict /path/to/JMdict_e.xml \{"\n"}
          {"  "}--kanjidic /path/to/kanjidic2.xml
        </pre>
      </div>
    </div>
  );
}
