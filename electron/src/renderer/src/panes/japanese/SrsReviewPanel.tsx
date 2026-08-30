import { useEffect, useState } from "react";
import {
  getJapaneseLexeme,
  listDueJapaneseSrsCards,
  reviewJapaneseSrsCard,
  type JapaneseLexemeDetail,
  type JapaneseSrsCard,
} from "../../electron";

interface DueItem {
  card: JapaneseSrsCard;
  detail: JapaneseLexemeDetail | null;
}

export function SrsReviewPanel({
  onOpenLexeme,
  onQueueChange,
}: {
  onOpenLexeme: (entSeq: number) => void;
  onQueueChange?: () => void;
}) {
  const [items, setItems] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const cards = (await listDueJapaneseSrsCards(30)) ?? [];
      const enriched = await Promise.all(
        cards.map(async (card) => ({
          card,
          detail: await getJapaneseLexeme(card.entSeq),
        })),
      );
      setItems(enriched);
      if (enriched.length === 0) setMessage("No cards due. Add entries from a word detail view.");
      onQueueChange?.();
    } catch {
      setMessage("Failed to load SRS queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const review = async (entSeq: number, quality: number) => {
    await reviewJapaneseSrsCard(entSeq, quality);
    await load();
  };

  if (loading) return <div className="japanese-pane-detail-empty">Loading review queue…</div>;

  return (
    <div className="japanese-srs-panel">
      <div className="japanese-srs-toolbar">
        <button type="button" className="japanese-stroke-btn" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {message ? <p className="japanese-pane-toolbar-hint">{message}</p> : null}
      <ul className="japanese-hit-list">
        {items.map(({ card, detail }) => {
          const title =
            detail?.writings[0]?.orthography ??
            detail?.readings[0]?.kana ??
            `#${card.entSeq}`;
          const reading = detail?.readings[0]?.kana;
          const gloss = detail?.senses[0]?.glosses.find((g) => g.lang === "en")?.text;
          return (
            <li key={card.entSeq} className="japanese-srs-item">
              <button type="button" className="japanese-hit-item" onClick={() => onOpenLexeme(card.entSeq)}>
                <span className="japanese-hit-primary">{title}</span>
                {reading ? <span className="japanese-hit-reading">{reading}</span> : null}
                {gloss ? <span className="japanese-hit-gloss">{gloss}</span> : null}
              </button>
              <div className="japanese-srs-grade-row">
                {[1, 2, 3, 4, 5].map((quality) => (
                  <button
                    key={quality}
                    type="button"
                    className="japanese-srs-grade-btn"
                    onClick={() => void review(card.entSeq, quality)}
                  >
                    {quality}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
