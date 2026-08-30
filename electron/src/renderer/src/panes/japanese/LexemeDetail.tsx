import { useEffect, useState } from "react";
import { getJapaneseLexeme, type JapaneseLexemeDetail } from "../../electron";
import { PitchAccentDisplay } from "./PitchAccentDisplay";
import { formatJapanesePos } from "./posLabels";

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

  if (loading) return <div className="japanese-pane-detail-empty">불러오는 중…</div>;
  if (error) return <div className="japanese-pane-detail-empty">{error}</div>;
  if (!detail) return <div className="japanese-pane-detail-empty">항목을 찾을 수 없습니다.</div>;

  const primaryWriting = detail.writings[0]?.orthography ?? null;
  const primaryReading = detail.readings[0]?.kana ?? null;
  const title = primaryWriting ?? primaryReading ?? `#${detail.entSeq}`;
  const priorityTags = [
    ...new Set(
      [...detail.writings, ...detail.readings]
        .flatMap((entry) => (entry.priority ?? "").split(","))
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];

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
        {priorityTags.length > 0 ? (
          <div className="japanese-priority-tags">
            {priorityTags.map((tag) => (
              <span key={tag} className="japanese-priority-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {detail.readings.length > 1 ? (
          <div className="japanese-lexeme-alt-readings">
            {(detail.readings ?? []).slice(1).map((reading) => reading.kana).join(" · ")}
          </div>
        ) : null}
      </header>

      {(detail.pitchPatterns ?? []).length > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">성조</h3>
          <ul className="japanese-pitch-list">
            {(detail.pitchPatterns ?? []).map((pitch) => (
              <li key={`${pitch.reading}-${pitch.pattern}`} className="japanese-pitch-item">
                <PitchAccentDisplay reading={pitch.reading} pattern={pitch.pattern} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {kanjiLiterals.size > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">한자</h3>
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

      {(detail.senses ?? []).some((sense) => (sense.glosses ?? []).some((gloss) => gloss.lang === "ko")) ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">뜻 (한국어)</h3>
          <ol className="japanese-sense-list">
            {(detail.senses ?? []).map((sense) => {
              const korean = (sense.glosses ?? [])
                .filter((gloss) => gloss.lang === "ko")
                .map((gloss) => gloss.text);
              if (korean.length === 0) return null;
              return (
                <li key={`ko-${sense.senseNo}`} className="japanese-sense-item">
                  {(sense.pos ?? []).length > 0 ? (
                    <span className="japanese-sense-pos">
                      {(sense.pos ?? []).map(formatJapanesePos).join(" · ")}
                    </span>
                  ) : null}
                  {korean.join("; ")}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="japanese-lexeme-section">
        <h3 className="japanese-section-title">뜻 (영어)</h3>
        <ol className="japanese-sense-list">
          {detail.senses.map((sense) => {
            const english = (sense.glosses ?? [])
              .filter((gloss) => gloss.lang === "en")
              .map((gloss) => gloss.text);
            if (english.length === 0) return null;
            return (
              <li key={sense.senseNo} className="japanese-sense-item">
                {(sense.pos ?? []).length > 0 ? (
                  <span className="japanese-sense-pos">
                    {(sense.pos ?? []).map(formatJapanesePos).join(" · ")}
                  </span>
                ) : null}
                {english.join("; ")}
              </li>
            );
          })}
        </ol>
      </section>

      {(detail.examples ?? []).length > 0 ? (
        <section className="japanese-lexeme-section">
          <h3 className="japanese-section-title">예문</h3>
          <ul className="japanese-example-list">
            {(detail.examples ?? []).map((example) => (
              <li key={example.id} className="japanese-example-item">
                <div className="japanese-example-ja">{example.textJa}</div>
                {example.textKo ? <div className="japanese-example-ko">{example.textKo}</div> : null}
                {example.textEn ? <div className="japanese-example-en">{example.textEn}</div> : null}
              </li>
            ))}
          </ul>
          {(detail.examples ?? []).length >= 20 ? (
            <p className="japanese-pane-toolbar-hint">최대 20개까지 표시됩니다.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
