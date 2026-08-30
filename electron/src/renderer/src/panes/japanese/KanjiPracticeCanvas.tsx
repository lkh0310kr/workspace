import { useRef, useState } from "react";
import { scoreJapanesePractice } from "../../electron";

interface Point {
  x: number;
  y: number;
}

interface Props {
  literal: string;
}

export function KanjiPracticeCanvas({ literal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [activeStroke, setActiveStroke] = useState<Point[] | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [scoring, setScoring] = useState(false);

  const redraw = (nextStrokes: Point[][], current: Point[] | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
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

  const grade = async (nextStrokes: Point[][]) => {
    if (nextStrokes.length === 0) return;
    setScoring(true);
    try {
      const result = await scoreJapanesePractice(literal, nextStrokes.map((points) => ({ points })));
      setScore(result.score);
    } finally {
      setScoring(false);
    }
  };

  return (
    <section className="japanese-practice">
      <h3 className="japanese-section-title">Practice writing</h3>
      <canvas
        ref={canvasRef}
        className="japanese-handwriting-canvas"
        width={220}
        height={220}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const stroke = [toCanvasPoint(event)];
          setActiveStroke(stroke);
          redraw(strokes, stroke);
        }}
        onPointerMove={(event) => {
          if (!activeStroke) return;
          const stroke = [...activeStroke, toCanvasPoint(event)];
          setActiveStroke(stroke);
          redraw(strokes, stroke);
        }}
        onPointerUp={() => {
          if (!activeStroke || activeStroke.length === 0) return;
          const next = [...strokes, activeStroke];
          setStrokes(next);
          setActiveStroke(null);
          redraw(next, null);
          void grade(next);
        }}
      />
      <div className="japanese-practice-actions">
        <button
          type="button"
          className="japanese-stroke-btn"
          onClick={() => {
            setStrokes([]);
            setActiveStroke(null);
            setScore(null);
            redraw([], null);
          }}
        >
          Clear
        </button>
        {scoring ? <span className="japanese-pane-toolbar-hint">Scoring…</span> : null}
        {score != null ? (
          <span className="japanese-practice-score">Match score: {Math.round(score * 100)}%</span>
        ) : null}
      </div>
    </section>
  );
}
