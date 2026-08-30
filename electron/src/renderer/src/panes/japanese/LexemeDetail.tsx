import { useEffect, useState } from "react";
import { getJapaneseLexeme, type JapaneseLexemeDetail } from "../../electron";

interface Props {
  entSeq: number;
  onKanjiClick: (literal: string) => void;
}

export function LexemeDetail({ entSeq, onKanjiClick }: Props) {
  const [detail, setDetail] = useState<JapaneseLexemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getJapaneseLexeme(entSeq)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "failed to load entry");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entSeq]);

  if (loading) return <div className="japanese-pane-detail-empty">Loading…</div>;
  if (error) return <div className="japanese-pane-detail-empty">{error}</div>;
  if (!detail) return <div className="japanese-pane-detail-empty">Entry not found.</div>;

  const primaryWriting = detail.writings[0]?.orthography ?? null;
  const primaryReading = detail.readings[0]?.kana ?? null;
  const title = primaryWriting ?? primaryReading ?? `#${detail.entSeq}`;

  const kanjiLiterals = new Set<string>();
  for (const writing of detail.writings) {
    for (const char of writing.orthography) {
      if (/\p{Script=Han}/u.test(char)) kanjiLiterals.add(char);
    }
  }

  return (
    <div className="japanese-lexeme-detail">
      <header className="japanese-lexeme-header">
        <h2 className="japanese-lexeme-title">{title}</h2>
        {primaryReading ? <div className="japanese-lexeme-reading">{primaryReading}</div> : null}
        {detail.readings.length > 1 ? (
          <div className="japanese-lexeme-alt-readings">
            {detail.readings.slice(1).map((reading) => reading.kana).join(" · ")}
          </div>
        ) : null}
      </header>

      {kanjiLiterals.size > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">Kanji</h3>
          <div className="japanese-kanji-chips">
            {[...kanjiLiterals].map((literal) => (
              <button
                key={literal}
                type="button"
                className="japanese-kanji-chip"
                onClick={() => onKanjiClick(literal)}
              >
                {literal}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="japanese-lexeme-section">
        <h3 className="japanese-section-title">Meanings</h3>
        <ol className="japanese-sense-list">
          {detail.senses.map((sense) => (
            <li key={sense.senseNo} className="japanese-sense-item">
              {sense.glosses
                .filter((gloss) => gloss.lang === "en")
                .map((gloss) => gloss.text)
                .join("; ") || sense.glosses.map((gloss) => gloss.text).join("; ")}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
