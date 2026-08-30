import { useEffect, useRef, useState } from "react";
import { recognizeJapaneseStrokes } from "../../electron";

interface Point {
  x: number;
  y: number;
}

interface Candidate {
  literal: string;
  score: number;
}

interface Props {
  onSelectKanji: (literal: string) => void;
  onCandidatesChange?: (candidates: Candidate[]) => void;
  autoRecognize?: boolean;
  compact?: boolean;
}

export function HandwritingCanvas({
  onSelectKanji,
  onCandidatesChange,
  autoRecognize = false,
  compact = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognizeTimerRef = useRef<number | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [activeStroke, setActiveStroke] = useState<Point[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recognizing, setRecognizing] = useState(false);

  const canvasSize = compact ? 120 : 220;

  const publishCandidates = (next: Candidate[]) => {
    setCandidates(next);
    onCandidatesChange?.(next);
  };

  const redraw = (nextStrokes: Point[][], current: Point[] | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = compact ? 2.5 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--text").trim() || "#fff";
    const drawStroke = (stroke: Point[]) => {
      if (stroke.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    };
    for (const stroke of nextStrokes) drawStroke(stroke);
    if (current) drawStroke(current);
  };

  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const scheduleRecognize = (nextStrokes: Point[][]) => {
    if (!autoRecognize || nextStrokes.length === 0) return;
    if (recognizeTimerRef.current != null) window.clearTimeout(recognizeTimerRef.current);
    recognizeTimerRef.current = window.setTimeout(() => {
      void recognizeStrokes(nextStrokes);
    }, 400);
  };

  const recognizeStrokes = async (strokeSet: Point[][]) => {
    if (strokeSet.length === 0) {
      publishCandidates([]);
      return;
    }
    setRecognizing(true);
    try {
      const result = await recognizeJapaneseStrokes(strokeSet.map((points) => ({ points })));
      publishCandidates(Array.isArray(result.candidates) ? result.candidates : []);
    } catch {
      publishCandidates([]);
    } finally {
      setRecognizing(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toCanvasPoint(event);
    const stroke = [point];
    setActiveStroke(stroke);
    redraw(strokes, stroke);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke) return;
    const point = toCanvasPoint(event);
    const stroke = [...activeStroke, point];
    setActiveStroke(stroke);
    redraw(strokes, stroke);
  };

  const finishStroke = () => {
    if (!activeStroke || activeStroke.length === 0) return;
    const next = [...strokes, activeStroke];
    setStrokes(next);
    setActiveStroke(null);
    redraw(next, null);
    scheduleRecognize(next);
  };

  const handlePointerUp = () => finishStroke();

  const undo = () => {
    const next = strokes.slice(0, -1);
    setStrokes(next);
    publishCandidates([]);
    redraw(next, null);
    scheduleRecognize(next);
  };

  const clear = () => {
    setStrokes([]);
    setActiveStroke(null);
    publishCandidates([]);
    redraw([], null);
    if (recognizeTimerRef.current != null) window.clearTimeout(recognizeTimerRef.current);
  };

  useEffect(() => {
    return () => {
      if (recognizeTimerRef.current != null) window.clearTimeout(recognizeTimerRef.current);
    };
  }, []);

  return (
    <div className={`japanese-handwriting${compact ? " is-compact" : ""}`}>
      <canvas
        ref={canvasRef}
        className="japanese-handwriting-canvas"
        width={canvasSize}
        height={canvasSize}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        aria-label="한자 필기 입력"
      />
      <div className="japanese-handwriting-toolbar">
        <button type="button" className="japanese-stroke-btn" onClick={undo} disabled={strokes.length === 0}>
          한 획
        </button>
        <button type="button" className="japanese-stroke-btn" onClick={clear} disabled={strokes.length === 0}>
          지우기
        </button>
        {!autoRecognize ? (
          <button
            type="button"
            className="japanese-stroke-btn"
            onClick={() => void recognizeStrokes(strokes)}
            disabled={strokes.length === 0 || recognizing}
          >
            {recognizing ? "인식 중…" : "한자 찾기"}
          </button>
        ) : recognizing ? (
          <span className="japanese-handwriting-score">인식 중…</span>
        ) : null}
      </div>
      {!compact && candidates.length > 0 ? (
        <ul className="japanese-handwriting-candidates">
          {candidates.map((candidate) => (
            <li key={candidate.literal}>
              <button type="button" className="japanese-kanji-chip" onClick={() => onSelectKanji(candidate.literal)}>
                {candidate.literal}
              </button>
              <span className="japanese-handwriting-score">{Math.round(candidate.score * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
