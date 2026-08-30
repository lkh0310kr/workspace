import { useCallback, useEffect, useRef, useState } from "react";
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
  const [hitIndex, setHitIndex] = useState(0);
  const { hits, loading, error } = useJapaneseSearch(query);
  const wasReadyRef = useRef(status?.ready ?? false);
  const hitList = hits ?? [];

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

  useEffect(() => {
    if (mode !== "search") return;
    if (!query.trim() || hitList.length === 0) {
      setHitIndex(0);
      if (detail.kind === "lexeme") setDetail({ kind: "none" });
      return;
    }
    const currentIndex = hitList.findIndex(
      (hit) => detail.kind === "lexeme" && hit.entSeq === detail.entSeq,
    );
    if (currentIndex < 0) {
      setHitIndex(0);
      setDetail({ kind: "lexeme", entSeq: hitList[0].entSeq });
      return;
    }
    setHitIndex(currentIndex);
  }, [hitList, query, mode, detail.kind, detail.kind === "lexeme" ? detail.entSeq : null]);

  const selectHit = useCallback(
    (index: number) => {
      const hit = hitList[index];
      if (!hit) return;
      setHitIndex(index);
      setDetail({ kind: "lexeme", entSeq: hit.entSeq });
    },
    [hitList],
  );

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (mode !== "search" || hitList.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectHit(Math.min(hitIndex + 1, hitList.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectHit(Math.max(hitIndex - 1, 0));
      } else if (event.key === "Enter" && hitList[hitIndex]) {
        event.preventDefault();
        selectHit(hitIndex);
      }
    },
    [hitIndex, hitList, mode, selectHit],
  );

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
            title="사전 다시 불러오기"
          >
            {reloading ? "…" : "↻"}
          </button>
        ) : null}
      </div>

      {mode === "search" && status?.ready ? (
        <JapaneseSearchBar
          query={query}
          onQueryChange={setQuery}
          onKeyDown={handleSearchKeyDown}
          hitCount={query.trim() ? hitList.length : null}
          loading={loading}
        />
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
            {mode === "search" && loading ? (
              <div className="japanese-pane-detail-empty">검색 중…</div>
            ) : null}
            {mode === "search" && error ? <div className="japanese-pane-detail-empty">{error}</div> : null}
            {mode === "search" && !loading && !error && query.trim() && hitList.length === 0 ? (
              <div className="japanese-pane-detail-empty">결과가 없습니다.</div>
            ) : null}
            {mode === "search" && !query.trim() ? (
              <div className="japanese-pane-welcome">
                <p className="japanese-pane-welcome-title">단어·읽기·로마자로 검색</p>
                <p className="japanese-pane-toolbar-hint">
                  예: 食べる, にほん, nihon, taberu — ↑↓로 결과 이동
                </p>
              </div>
            ) : null}
            {mode === "search" && query.trim() ? (
              <ul className="japanese-hit-list" role="listbox" aria-label="검색 결과">
                {hitList.map((hit, index) => (
                  <li key={hit.entSeq} role="option" aria-selected={hitIndex === index}>
                    <button
                      type="button"
                      className={`japanese-hit-item${hitIndex === index ? " is-active" : ""}`}
                      onClick={() => selectHit(index)}
                    >
                      <span className="japanese-hit-head">
                        <span className="japanese-hit-primary">
                          {hit.primaryWriting ?? hit.primaryReading ?? `#${hit.entSeq}`}
                        </span>
                        {hit.primaryWriting && hit.primaryReading ? (
                          <span className="japanese-hit-reading">{hit.primaryReading}</span>
                        ) : null}
                      </span>
                      {hit.glossPreview ? (
                        <span className="japanese-hit-gloss">{hit.glossPreview}</span>
                      ) : null}
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
            {detail.kind === "none" && mode === "search" && query.trim() && !loading ? (
              <div className="japanese-pane-detail-empty">항목을 선택하세요.</div>
            ) : null}
            {detail.kind === "none" && mode === "handwriting" ? (
              <div className="japanese-pane-detail-empty">필기로 찾은 한자를 선택하세요.</div>
            ) : null}
            {detail.kind === "none" && mode === "review" ? (
              <div className="japanese-pane-detail-empty">복습 카드를 선택하세요.</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
