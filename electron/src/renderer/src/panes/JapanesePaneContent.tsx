import { useCallback, useEffect, useState } from "react";
import "../assets/japanese-fonts.css";
import { ScrollRegion } from "../components/ScrollRegion";
import type { PaneTabItem } from "../layout/paneTypes";
import { DictionarySetup } from "./japanese/DictionarySetup";
import { JapaneseDetailNav } from "./japanese/JapaneseDetailNav";
import { JapaneseSettingsDialog } from "./japanese/JapaneseSettingsDialog";
import { JapaneseUnifiedSearch, useJapaneseSearch } from "./japanese/JapaneseUnifiedSearch";
import { KanjiDetail } from "./japanese/KanjiDetail";
import { LexemeDetail } from "./japanese/LexemeDetail";
import { useJapaneseDb } from "./japanese/useJapaneseDb";

interface Props {
  item: PaneTabItem;
  onUpdateItem?: (patch: Partial<PaneTabItem>) => void;
}

type DetailView =
  | { kind: "none" }
  | { kind: "lexeme"; entSeq: number }
  | { kind: "kanji"; literal: string };

export function JapanesePaneContent({ item, onUpdateItem }: Props) {
  const { status } = useJapaneseDb();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailView>({ kind: "none" });
  const [returnDetail, setReturnDetail] = useState<DetailView | null>(null);
  const [hitIndex, setHitIndex] = useState(0);
  const [handwritingCandidates, setHandwritingCandidates] = useState<{ literal: string; score: number }[]>([]);
  const { hits, loading, error } = useJapaneseSearch(query);
  const hitList = hits ?? [];
  const settingsOpen = item.japaneseSettingsOpen === true;

  useEffect(() => {
    if (detail.kind === "kanji") return;

    if (!query.trim() || hitList.length === 0) {
      setHitIndex(0);
      if (detail.kind === "lexeme") setDetail({ kind: "none" });
      return;
    }

    if (detail.kind === "none") {
      setHitIndex(0);
      setDetail({ kind: "lexeme", entSeq: hitList[0].entSeq });
      return;
    }

    const currentIndex = hitList.findIndex((hit) => hit.entSeq === detail.entSeq);
    if (currentIndex < 0) {
      setHitIndex(0);
      setDetail({ kind: "lexeme", entSeq: hitList[0].entSeq });
      return;
    }
    setHitIndex(currentIndex);
  }, [hitList, query, detail]);

  const selectHit = useCallback(
    (index: number) => {
      const hit = hitList[index];
      if (!hit) return;
      setHitIndex(index);
      setReturnDetail(null);
      setDetail({ kind: "lexeme", entSeq: hit.entSeq });
    },
    [hitList],
  );

  const openKanji = useCallback(
    (literal: string) => {
      if (detail.kind === "lexeme") {
        setReturnDetail(detail);
      }
      setDetail({ kind: "kanji", literal });
    },
    [detail],
  );

  const openLexeme = useCallback((entSeq: number) => {
    setReturnDetail(null);
    setDetail({ kind: "lexeme", entSeq });
  }, []);

  const goBack = useCallback(() => {
    if (!returnDetail) return;
    setDetail(returnDetail);
    setReturnDetail(null);
  }, [returnDetail]);

  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    if (next.trim()) setHandwritingCandidates([]);
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (hitList.length === 0) return;
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
    [hitIndex, hitList, selectHit],
  );

  const closeSettings = useCallback(() => {
    onUpdateItem?.({ japaneseSettingsOpen: false });
  }, [onUpdateItem]);

  if (!status?.ready) {
    return (
      <div className="japanese-pane">
        <ScrollRegion className="japanese-pane-body">
          <DictionarySetup />
        </ScrollRegion>
      </div>
    );
  }

  return (
    <div className="japanese-pane">
      {settingsOpen ? <JapaneseSettingsDialog onClose={closeSettings} /> : null}

      <JapaneseUnifiedSearch
        query={query}
        onQueryChange={handleQueryChange}
        onKeyDown={handleSearchKeyDown}
        onSelectKanji={openKanji}
        onHandwritingCandidates={setHandwritingCandidates}
      />

      <div className="japanese-pane-split">
        <ScrollRegion className="japanese-pane-results">
          {loading ? <div className="japanese-pane-detail-empty">검색 중…</div> : null}
          {error ? <div className="japanese-pane-detail-empty">{error}</div> : null}

          {handwritingCandidates.length > 0 ? (
            <section className="japanese-results-section">
              <h3 className="japanese-results-section-title">필기 인식</h3>
              <ul className="japanese-handwriting-candidates">
                {handwritingCandidates.map((candidate) => (
                  <li key={candidate.literal}>
                    <button
                      type="button"
                      className={`japanese-kanji-chip${detail.kind === "kanji" && detail.literal === candidate.literal ? " is-active" : ""}`}
                      onClick={() => openKanji(candidate.literal)}
                    >
                      {candidate.literal}
                    </button>
                    <span className="japanese-handwriting-score">{Math.round(candidate.score * 100)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!loading && !error && query.trim() && hitList.length === 0 ? (
            <div className="japanese-pane-detail-empty">결과가 없습니다.</div>
          ) : null}

          {query.trim() && hitList.length > 0 ? (
            <section className="japanese-results-section">
              {handwritingCandidates.length > 0 ? (
                <h3 className="japanese-results-section-title">단어 검색</h3>
              ) : null}
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
            </section>
          ) : null}
        </ScrollRegion>

        <ScrollRegion className="japanese-pane-detail">
          {detail.kind === "kanji" ? (
            <JapaneseDetailNav onBack={returnDetail ? goBack : undefined} />
          ) : null}
          {detail.kind === "lexeme" ? (
            <LexemeDetail entSeq={detail.entSeq} onKanjiClick={openKanji} />
          ) : null}
          {detail.kind === "kanji" ? (
            <KanjiDetail literal={detail.literal} onLexemeClick={openLexeme} />
          ) : null}
          {detail.kind === "none" && (query.trim() || handwritingCandidates.length > 0) && !loading ? (
            <div className="japanese-pane-detail-empty">항목을 선택하세요.</div>
          ) : null}
        </ScrollRegion>
      </div>
    </div>
  );
}
