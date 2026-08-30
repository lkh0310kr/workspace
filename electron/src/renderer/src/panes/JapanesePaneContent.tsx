import { useEffect, useRef, useState } from "react";
import type { PaneTabItem } from "../layout/paneTypes";
import { countDueJapaneseSrsCards } from "../electron";
import { DictionarySetup } from "./japanese/DictionarySetup";
import { HandwritingCanvas } from "./japanese/HandwritingCanvas";
import { JapaneseSearchBar } from "./japanese/JapaneseSearchBar";
import { KanjiDetail } from "./japanese/KanjiDetail";
import { LexemeDetail } from "./japanese/LexemeDetail";
import { SrsReviewPanel } from "./japanese/SrsReviewPanel";
import { useJapaneseSearch } from "./japanese/SearchBar";
import { useJapaneseDb } from "./japanese/useJapaneseDb";

interface Props {
  item: PaneTabItem;
}

type PaneMode = "search" | "handwriting" | "review" | "setup";

type DetailView =
  | { kind: "none" }
  | { kind: "lexeme"; entSeq: number }
  | { kind: "kanji"; literal: string };

export function JapanesePaneContent({ item: _item }: Props) {
  const { status, reload, reloading } = useJapaneseDb();
  const [dueCount, setDueCount] = useState(0);
  const [mode, setMode] = useState<PaneMode>("search");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailView>({ kind: "none" });
  const { hits, loading, error } = useJapaneseSearch(query);
  const wasReadyRef = useRef(status?.ready ?? false);

  useEffect(() => {
    const ready = status?.ready ?? false;
    if (!wasReadyRef.current && ready) {
      setMode("search");
    }
    wasReadyRef.current = ready;
  }, [status?.ready]);

  useEffect(() => {
    if (!status?.ready) {
      setDueCount(0);
      return;
    }
    countDueJapaneseSrsCards()
      .then(setDueCount)
      .catch(() => setDueCount(0));
  }, [status?.ready, mode]);

  const showSetup = !status?.ready && mode !== "setup";

  return (
    <div className="japanese-pane">
      <div className="japanese-pane-mode-tabs">
        <button
          type="button"
          className={`japanese-mode-tab${mode === "search" ? " is-active" : ""}`}
          onClick={() => setMode("search")}
        >
          검색
        </button>
        <button
          type="button"
          className={`japanese-mode-tab${mode === "handwriting" ? " is-active" : ""}`}
          onClick={() => setMode("handwriting")}
        >
          필기
        </button>
        <button
          type="button"
          className={`japanese-mode-tab${mode === "review" ? " is-active" : ""}`}
          onClick={() => setMode("review")}
        >
          복습
          {dueCount > 0 ? <span className="japanese-mode-tab-badge">{dueCount}</span> : null}
        </button>
        <button
          type="button"
          className={`japanese-mode-tab${mode === "setup" ? " is-active" : ""}`}
          onClick={() => setMode("setup")}
        >
          데이터
        </button>
        {status?.ready ? (
          <button
            type="button"
            className="japanese-mode-tab japanese-mode-tab-reload"
            onClick={() => void reload()}
            disabled={reloading}
          >
            {reloading ? "…" : "↻"}
          </button>
        ) : null}
      </div>

      {mode === "search" && status?.ready ? (
        <JapaneseSearchBar query={query} onQueryChange={setQuery} />
      ) : null}

      {mode === "setup" || showSetup ? (
        <div className="japanese-pane-body">
          <DictionarySetup />
        </div>
      ) : (
        <div className="japanese-pane-split">
          <div className="japanese-pane-results">
            {mode === "handwriting" ? (
              <HandwritingCanvas onSelectKanji={(literal) => setDetail({ kind: "kanji", literal })} />
            ) : null}
            {mode === "review" ? (
              <SrsReviewPanel
                onOpenLexeme={(entSeq) => setDetail({ kind: "lexeme", entSeq })}
                onQueueChange={() => {
                  void countDueJapaneseSrsCards().then(setDueCount).catch(() => setDueCount(0));
                }}
              />
            ) : null}
            {mode === "search" && loading ? <div className="japanese-pane-detail-empty">Searching…</div> : null}
            {mode === "search" && error ? <div className="japanese-pane-detail-empty">{error}</div> : null}
            {mode === "search" && !loading && !error && query.trim() && (hits ?? []).length === 0 ? (
              <div className="japanese-pane-detail-empty">No results.</div>
            ) : null}
            {mode === "search" && !query.trim() ? (
              <div className="japanese-pane-detail-empty">Type to search the dictionary.</div>
            ) : null}
            {mode === "search" && query.trim() ? (
              <ul className="japanese-hit-list">
                {(hits ?? []).map((hit) => (
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
            {detail.kind === "none" && mode === "search" && query.trim() ? (
              <div className="japanese-pane-detail-empty">Select an entry.</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
