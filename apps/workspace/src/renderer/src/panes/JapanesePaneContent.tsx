import { useCallback, useEffect, useState } from "react";
import "../assets/japanese-fonts.css";
import { ScrollRegion } from "../components/ScrollRegion";
import type { PaneTabItem } from "../layout/paneTypes";
import { sameDetail, type DetailView } from "./japanese/detailView";
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

const SINGLE_HAN_RE = /^\p{Script=Han}$/u;

export function JapanesePaneContent({ item, onUpdateItem }: Props) {
  const { status } = useJapaneseDb();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailView>({ kind: "none" });
  const [returnDetail, setReturnDetail] = useState<DetailView | null>(null);
  const [hitIndex, setHitIndex] = useState(0);
  const [handwritingCandidates, setHandwritingCandidates] = useState<{ literal: string; score: number }[]>([]);
  // `?? []` here would hand the effect below a new array every render.
  const { hits: hitList, kanjiHits: kanjiList, loading, error } = useJapaneseSearch(query);
  const settingsOpen = item.japaneseSettingsOpen === true;

  const showDetail = useCallback((next: DetailView) => {
    setDetail((current) => (sameDetail(current, next) ? current : next));
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || loading) {
      if (!trimmed) {
        setHitIndex(0);
        setReturnDetail(null);
        showDetail({ kind: "none" });
      }
      return;
    }

    const exactKanji = kanjiList.find((hit) => hit.literal === trimmed);
    const preferKanji =
      exactKanji ??
      (kanjiList.length > 0 && hitList.length === 0 ? kanjiList[0] : null) ??
      (SINGLE_HAN_RE.test(trimmed) ? kanjiList[0] : null);

    if (preferKanji) {
      setReturnDetail(null);
      showDetail({ kind: "kanji", literal: preferKanji.literal });
      return;
    }

    if (hitList.length === 0) {
      setHitIndex(0);
      showDetail({ kind: "none" });
      return;
    }

    if (detail.kind === "kanji") return;

    if (detail.kind === "none") {
      setHitIndex(0);
      showDetail({ kind: "lexeme", entSeq: hitList[0].entSeq });
      return;
    }

    const currentIndex = hitList.findIndex((hit) => hit.entSeq === detail.entSeq);
    if (currentIndex < 0) {
      setHitIndex(0);
      showDetail({ kind: "lexeme", entSeq: hitList[0].entSeq });
      return;
    }
    setHitIndex(currentIndex);
  }, [hitList, kanjiList, query, detail, loading, showDetail]);

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
      const total = hitList.length + kanjiList.length;
      if (total === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (hitIndex < hitList.length - 1) {
          selectHit(hitIndex + 1);
        } else if (kanjiList.length > 0) {
          const kanjiIndex = hitIndex - hitList.length;
          const nextKanji = kanjiList[Math.min(kanjiIndex + 1, kanjiList.length - 1)];
          if (nextKanji) {
            setReturnDetail(null);
            setDetail({ kind: "kanji", literal: nextKanji.literal });
            setHitIndex(hitList.length + Math.min(kanjiIndex + 1, kanjiList.length - 1));
          }
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (hitIndex > 0) {
          if (hitIndex < hitList.length) {
            selectHit(hitIndex - 1);
          } else {
            const kanjiIndex = hitIndex - hitList.length;
            if (kanjiIndex > 0) {
              const prevKanji = kanjiList[kanjiIndex - 1];
              setReturnDetail(null);
              setDetail({ kind: "kanji", literal: prevKanji.literal });
              setHitIndex(hitList.length + kanjiIndex - 1);
            } else if (hitList.length > 0) {
              selectHit(hitList.length - 1);
            }
          }
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (hitIndex < hitList.length) {
          selectHit(hitIndex);
        } else {
          const kanji = kanjiList[hitIndex - hitList.length];
          if (kanji) {
            setReturnDetail(null);
            setDetail({ kind: "kanji", literal: kanji.literal });
          }
        }
      }
    },
    [hitIndex, hitList, kanjiList, selectHit],
  );

  const closeSettings = useCallback(() => {
    onUpdateItem?.({ japaneseSettingsOpen: false });
  }, [onUpdateItem]);

  const openSettings = useCallback(() => {
    onUpdateItem?.({ japaneseSettingsOpen: true });
  }, [onUpdateItem]);

  const settingsDialog = settingsOpen ? <JapaneseSettingsDialog onClose={closeSettings} /> : null;

  if (!status?.ready) {
    return (
      <>
        {settingsDialog}
        <div className="japanese-pane">
          <JapaneseUnifiedSearch
            query={query}
            onQueryChange={handleQueryChange}
            onKeyDown={handleSearchKeyDown}
            onSelectKanji={openKanji}
            onHandwritingCandidates={setHandwritingCandidates}
            loading={loading}
            error={error}
            onOpenSettings={openSettings}
          />
          <ScrollRegion className="japanese-pane-body">
            <DictionarySetup />
          </ScrollRegion>
        </div>
      </>
    );
  }

  return (
    <>
      {settingsDialog}
      <div className="japanese-pane">
      <JapaneseUnifiedSearch
        query={query}
        onQueryChange={handleQueryChange}
        onKeyDown={handleSearchKeyDown}
        onSelectKanji={openKanji}
        onHandwritingCandidates={setHandwritingCandidates}
        loading={loading}
        error={error}
        onOpenSettings={openSettings}
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

          {!loading && !error && query.trim() && hitList.length === 0 && kanjiList.length === 0 ? (
            <div className="japanese-pane-detail-empty">결과가 없습니다.</div>
          ) : null}

          {query.trim() && loading && kanjiList.length === 0 && hitList.length === 0 ? (
            <section className="japanese-results-section">
              <h3 className="japanese-results-section-title">한자</h3>
              <div className="japanese-pane-detail-empty">검색 중…</div>
            </section>
          ) : null}

          {query.trim() && kanjiList.length > 0 ? (
            <section className="japanese-results-section">
              <h3 className="japanese-results-section-title">한자</h3>
              <ul className="japanese-kanji-search-list">
                {kanjiList.map((hit) => (
                  <li key={hit.literal}>
                    <button
                      type="button"
                      className={`japanese-kanji-search-item${detail.kind === "kanji" && detail.literal === hit.literal ? " is-active" : ""}`}
                      onClick={() => {
                        setReturnDetail(null);
                        setDetail({ kind: "kanji", literal: hit.literal });
                      }}
                    >
                      <span className="japanese-kanji-search-glyph">{hit.literal}</span>
                      {hit.huneumPreview ? (
                        <span className="japanese-kanji-search-huneum">{hit.huneumPreview}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {query.trim() && hitList.length > 0 ? (
            <section className="japanese-results-section">
              {kanjiList.length > 0 || handwritingCandidates.length > 0 ? (
                <h3 className="japanese-results-section-title">단어</h3>
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
          {loading && query.trim() ? (
            <div className="japanese-pane-detail-empty">검색 중…</div>
          ) : null}
          {error ? <div className="japanese-pane-detail-empty japanese-pane-detail-error">{error}</div> : null}
          {detail.kind === "kanji" ? (
            <JapaneseDetailNav onBack={returnDetail ? goBack : undefined} />
          ) : null}
          {detail.kind === "lexeme" ? (
            <LexemeDetail entSeq={detail.entSeq} onKanjiClick={openKanji} />
          ) : null}
          {detail.kind === "kanji" ? (
            <KanjiDetail literal={detail.literal} onLexemeClick={openLexeme} />
          ) : null}
          {detail.kind === "none" && (query.trim() || handwritingCandidates.length > 0) && !loading && !error ? (
            <div className="japanese-pane-detail-empty">항목을 선택하세요.</div>
          ) : null}
        </ScrollRegion>
      </div>
    </div>
    </>
  );
}
