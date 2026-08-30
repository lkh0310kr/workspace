import { useEffect, useState } from "react";
import { getJapaneseKanji, type JapaneseKanjiDetail } from "../../electron";
import { KanjiStrokeViewer } from "./KanjiStrokeViewer";

interface Props {
  literal: string;
  onLexemeClick: (entSeq: number) => void;
}

export function KanjiDetail({ literal, onLexemeClick }: Props) {
  const [detail, setDetail] = useState<JapaneseKanjiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getJapaneseKanji(literal)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "failed to load kanji");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [literal]);

  if (loading) return <div className="japanese-pane-detail-empty">Loading…</div>;
  if (error) return <div className="japanese-pane-detail-empty">{error}</div>;
  if (!detail) return <div className="japanese-pane-detail-empty">Kanji not found.</div>;

  const onReadings = detail.readings.filter((reading) => reading.type === "on").map((reading) => reading.text);
  const kunReadings = detail.readings.filter((reading) => reading.type === "kun").map((reading) => reading.text);

  return (
    <div className="japanese-kanji-detail">
      <header className="japanese-kanji-header">
        <div className="japanese-kanji-glyph">{detail.literal}</div>
        <div className="japanese-kanji-meta">
          {detail.strokes != null ? <span>{detail.strokes} strokes</span> : null}
          {detail.grade != null ? <span>Grade {detail.grade}</span> : null}
          {detail.jlpt != null ? <span>JLPT N{detail.jlpt}</span> : null}
        </div>
      </header>

      <KanjiStrokeViewer literal={detail.literal} />

      {onReadings.length > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">On readings</h3>
          <p className="japanese-reading-line">{onReadings.join(" · ")}</p>
        </section>
      ) : null}

      {kunReadings.length > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">Kun readings</h3>
          <p className="japanese-reading-line">{kunReadings.join(" · ")}</p>
        </section>
      ) : null}

      {detail.linkedLexemes.length > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">Related words</h3>
          <ul className="japanese-hit-list">
            {detail.linkedLexemes.map((hit) => (
              <li key={hit.entSeq}>
                <button type="button" className="japanese-hit-item" onClick={() => onLexemeClick(hit.entSeq)}>
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
        </section>
      ) : null}
    </div>
  );
}
