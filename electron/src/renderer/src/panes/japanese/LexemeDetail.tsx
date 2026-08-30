import { useEffect, useState } from "react";
import { addJapaneseSrsCard, getJapaneseLexeme, type JapaneseLexemeDetail } from "../../electron";

interface Props {
  entSeq: number;
  onKanjiClick: (literal: string) => void;
}

export function LexemeDetail({ entSeq, onKanjiClick }: Props) {
  const [detail, setDetail] = useState<JapaneseLexemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [srsMessage, setSrsMessage] = useState<string | null>(null);

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
        <button
          type="button"
          className="japanese-stroke-btn"
          onClick={() => {
            addJapaneseSrsCard(entSeq)
              .then((card) => setSrsMessage(`SRS scheduled (next: ${new Date(card.due).toLocaleDateString()})`))
              .catch(() => setSrsMessage("Failed to add SRS card"));
          }}
        >
          Add to SRS
        </button>
        {srsMessage ? <p className="japanese-pane-toolbar-hint">{srsMessage}</p> : null}
      </header>

      {detail.pitchPatterns.length > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">Pitch accent</h3>
          <ul className="japanese-pitch-list">
            {detail.pitchPatterns.map((pitch) => (
              <li key={`${pitch.reading}-${pitch.pattern}`} className="japanese-pitch-item">
                <span className="japanese-pitch-reading">{pitch.reading}</span>
                <span className="japanese-pitch-pattern">{pitch.pattern}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
        <h3 className="japanese-section-title">Meanings (English)</h3>
        <ol className="japanese-sense-list">
          {detail.senses.map((sense) => {
            const english = sense.glosses.filter((gloss) => gloss.lang === "en").map((gloss) => gloss.text);
            if (english.length === 0) return null;
            return (
              <li key={sense.senseNo} className="japanese-sense-item">
                {english.join("; ")}
              </li>
            );
          })}
        </ol>
      </section>

      {detail.senses.some((sense) => sense.glosses.some((gloss) => gloss.lang === "ko")) ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">Meanings (Korean)</h3>
          <ol className="japanese-sense-list">
            {detail.senses.map((sense) => {
              const korean = sense.glosses.filter((gloss) => gloss.lang === "ko").map((gloss) => gloss.text);
              if (korean.length === 0) return null;
              return (
                <li key={`ko-${sense.senseNo}`} className="japanese-sense-item">
                  {korean.join("; ")}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {detail.examples.length > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">Examples</h3>
          <ul className="japanese-example-list">
            {detail.examples.map((example) => (
              <li key={example.id} className="japanese-example-item">
                <div className="japanese-example-ja">{example.textJa}</div>
                {example.textEn ? <div className="japanese-example-en">{example.textEn}</div> : null}
                {example.textKo ? <div className="japanese-example-ko">{example.textKo}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
