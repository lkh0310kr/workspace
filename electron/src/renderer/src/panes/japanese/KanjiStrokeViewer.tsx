import { useEffect, useMemo, useRef, useState } from "react";
import { getJapaneseStrokes, type JapaneseStrokeData } from "../../electron";

interface Props {
  literal: string;
}

const STROKE_MS = 650;
const LOOP_PAUSE_MS = 400;

export function KanjiStrokeViewer({ literal }: Props) {
  const [data, setData] = useState<JapaneseStrokeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJapaneseStrokes(literal)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setVisibleCount(result?.strokes?.length ? 1 : 0);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [literal]);

  useEffect(() => {
    if (!data?.strokes?.length || visibleCount === 0) return;

    if (visibleCount >= data.strokes.length) {
      timerRef.current = window.setTimeout(() => {
        setVisibleCount(1);
      }, LOOP_PAUSE_MS);
    } else {
      timerRef.current = window.setTimeout(() => {
        setVisibleCount((count) => count + 1);
      }, STROKE_MS);
    }

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [visibleCount, data]);

  const viewBox = useMemo(() => "0 0 109 109", []);

  if (loading) return <div className="japanese-stroke-viewer-empty">획순 불러오는 중…</div>;
  if (!data?.strokes?.length) {
    return <div className="japanese-stroke-viewer-empty">이 한자의 획 데이터가 없습니다.</div>;
  }

  const strokes = data.strokes;

  return (
    <section className="japanese-stroke-viewer">
      <svg className="japanese-stroke-svg" viewBox={viewBox} role="img" aria-label={`${literal} 획순`}>
        <rect width="109" height="109" className="japanese-stroke-bg" />
        {strokes.map((stroke, index) => {
          const visible = index < visibleCount;
          return (
            <path
              key={stroke.order}
              d={stroke.path}
              className={`japanese-stroke-path${visible ? " is-visible" : ""}`}
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: visible ? 0 : 1,
                transition: visible ? "stroke-dashoffset 0.45s ease" : undefined,
              }}
            />
          );
        })}
      </svg>
    </section>
  );
}
