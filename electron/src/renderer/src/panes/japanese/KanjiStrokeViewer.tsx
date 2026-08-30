import { useEffect, useMemo, useRef, useState } from "react";
import { getJapaneseStrokes, type JapaneseStrokeData } from "../../electron";

interface Props {
  literal: string;
}

const STROKE_MS = 650;

export function KanjiStrokeViewer({ literal }: Props) {
  const [data, setData] = useState<JapaneseStrokeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJapaneseStrokes(literal)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setVisibleCount(result?.strokes?.length ? 1 : 0);
        setPlaying(false);
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
    if (!playing || !data?.strokes?.length) return;
    if (visibleCount >= data.strokes.length) {
      setPlaying(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setVisibleCount((count) => count + 1);
    }, STROKE_MS);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [playing, visibleCount, data]);

  const viewBox = useMemo(() => "0 0 109 109", []);

  if (loading) return <div className="japanese-stroke-viewer-empty">Loading strokes…</div>;
  if (!data?.strokes?.length) return <div className="japanese-stroke-viewer-empty">Stroke data not imported for this kanji.</div>;

  const strokes = data.strokes;

  const reset = () => {
    setPlaying(false);
    setVisibleCount(strokes.length ? 1 : 0);
  };

  const play = () => {
    if (visibleCount >= strokes.length) {
      setVisibleCount(1);
    }
    setPlaying(true);
  };

  return (
    <section className="japanese-stroke-viewer">
      <div className="japanese-stroke-toolbar">
        <button type="button" className="japanese-stroke-btn" onClick={play} disabled={playing}>
          Play
        </button>
        <button type="button" className="japanese-stroke-btn" onClick={() => setPlaying(false)} disabled={!playing}>
          Pause
        </button>
        <button type="button" className="japanese-stroke-btn" onClick={reset}>
          Reset
        </button>
      </div>
      <svg className="japanese-stroke-svg" viewBox={viewBox} role="img" aria-label={`${literal} stroke order`}>
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
