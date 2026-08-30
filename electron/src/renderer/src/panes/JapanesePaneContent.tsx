import { useState } from "react";
import type { PaneTabItem } from "../layout/paneTypes";
import { HandwritingCanvas } from "./japanese/HandwritingCanvas";
import { KanjiDetail } from "./japanese/KanjiDetail";
import { LexemeDetail } from "./japanese/LexemeDetail";
import { SearchBar, useJapaneseSearch } from "./japanese/SearchBar";

interface Props {
  item: PaneTabItem;
}

type PaneMode = "search" | "handwriting";

type DetailView =
  | { kind: "none" }
  | { kind: "lexeme"; entSeq: number }
  | { kind: "kanji"; literal: string };

export function JapanesePaneContent({ item: _item }: Props) {
  const [mode, setMode] = useState<PaneMode>("search");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailView>({ kind: "none" });
  const { hits, loading, error } = useJapaneseSearch(query);

  return (
    <div className="japanese-pane">
      <div className="japanese-pane-mode-tabs">
        <button
          type="button"
          className={`japanese-mode-tab${mode === "search" ? " is-active" : ""}`}
          onClick={() => setMode("search")}
        >
          Search
        </button>
        <button
          type="button"
          className={`japanese-mode-tab${mode === "handwriting" ? " is-active" : ""}`}
          onClick={() => setMode("handwriting")}
        >
          Handwriting
        </button>
      </div>
      {mode === "search" ? <SearchBar query={query} onQueryChange={setQuery} /> : null}
      <div className="japanese-pane-split">
        <div className="japanese-pane-results">
          {mode === "handwriting" ? (
            <HandwritingCanvas onSelectKanji={(literal) => setDetail({ kind: "kanji", literal })} />
          ) : null}
          {mode === "search" && loading ? <div className="japanese-pane-detail-empty">Searching…</div> : null}
          {mode === "search" && error ? <div className="japanese-pane-detail-empty">{error}</div> : null}
          {mode === "search" && !loading && !error && query.trim() && hits.length === 0 ? (
            <div className="japanese-pane-detail-empty">No results.</div>
          ) : null}
          {mode === "search" && !query.trim() ? (
            <div className="japanese-pane-body">
              <p className="japanese-pane-empty">
                Dictionary not loaded yet? Import JMdict and KANJIDIC2:
              </p>
              <pre className="japanese-pane-import-hint">
                cd electron{"\n"}
                npm run japanese:import -- \{"\n"}
                {"  "}--jmdict /path/to/JMdict_e.xml \{"\n"}
                {"  "}--kanjidic /path/to/kanjidic2.xml \{"\n"}
                {"  "}--out ~/.config/workspace-app/japanese/dictionary.db
              </pre>
            </div>
          ) : mode === "search" ? (
            <ul className="japanese-hit-list">
              {hits.map((hit) => (
                <li key={hit.entSeq}>
                  <button
                    type="button"
                    className={`japanese-hit-item${detail.kind === "lexeme" && detail.entSeq === hit.entSeq ? " is-active" : ""}`}
                    onClick={() => setDetail({ kind: "lexeme", entSeq: hit.entSeq })}
                  >
                    <span className="japanese-hit-primary">
                      {hit.primaryWriting ?? hit.primaryReading ?? `#${hit.entSeq}`}
                    </span>
                    {hit.primaryWriting && hit.primaryReading ? (
                      <span className="japanese-hit-reading">{hit.primaryReading}</span>
                    ) : null}
                    {hit.glossPreview ? <span className="japanese-hit-gloss">{hit.glossPreview}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="japanese-pane-detail">
          {detail.kind === "lexeme" ? (
            <LexemeDetail
              entSeq={detail.entSeq}
              onKanjiClick={(literal) => setDetail({ kind: "kanji", literal })}
            />
          ) : null}
          {detail.kind === "kanji" ? (
            <KanjiDetail
              literal={detail.literal}
              onLexemeClick={(entSeq) => setDetail({ kind: "lexeme", entSeq })}
            />
          ) : null}
          {detail.kind === "none" && query.trim() ? (
            <div className="japanese-pane-detail-empty">Select an entry.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
