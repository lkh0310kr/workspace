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

const GRADE_LABELS = ["", "어려움", "힘듦", "보통", "쉬움", "완벽"];

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
      if (enriched.length === 0) {
        setMessage("복습할 카드가 없습니다. 단어 상세에서 「복습에 추가」를 눌러 보세요.");
      }
      onQueueChange?.();
    } catch {
      setMessage("복습 목록을 불러오지 못했습니다.");
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

  if (loading) return <div className="japanese-pane-detail-empty">복습 목록 불러오는 중…</div>;

  return (
    <div className="japanese-srs-panel">
      <div className="japanese-srs-toolbar">
        <button type="button" className="japanese-stroke-btn" onClick={() => void load()}>
          새로고침
        </button>
      </div>
      {message ? <p className="japanese-pane-toolbar-hint">{message}</p> : null}
      <ul className="japanese-hit-list">
        {items.map(({ card, detail }) => {
          const title =
            detail?.writings[0]?.orthography ?? detail?.readings[0]?.kana ?? `#${card.entSeq}`;
          const reading = detail?.readings[0]?.kana;
          const gloss =
            detail?.senses[0]?.glosses.find((g) => g.lang === "ko")?.text ??
            detail?.senses[0]?.glosses.find((g) => g.lang === "en")?.text;
          return (
            <li key={card.entSeq} className="japanese-srs-item">
              <button type="button" className="japanese-hit-item" onClick={() => onOpenLexeme(card.entSeq)}>
                <span className="japanese-hit-head">
                  <span className="japanese-hit-primary">{title}</span>
                  {reading ? <span className="japanese-hit-reading">{reading}</span> : null}
                </span>
                {gloss ? <span className="japanese-hit-gloss">{gloss}</span> : null}
              </button>
              <div className="japanese-srs-grade-row">
                {[1, 2, 3, 4, 5].map((quality) => (
                  <button
                    key={quality}
                    type="button"
                    className="japanese-srs-grade-btn"
                    title={GRADE_LABELS[quality]}
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
