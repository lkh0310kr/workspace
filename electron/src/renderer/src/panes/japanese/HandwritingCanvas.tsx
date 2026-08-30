import { useRef, useState } from "react";
import { recognizeJapaneseStrokes } from "../../electron";

interface Point {
  x: number;
  y: number;
}

interface Props {
  onSelectKanji: (literal: string) => void;
}

export function HandwritingCanvas({ onSelectKanji }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [activeStroke, setActiveStroke] = useState<Point[] | null>(null);
  const [candidates, setCandidates] = useState<{ literal: string; score: number }[]>([]);
  const [recognizing, setRecognizing] = useState(false);

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
  };

  const handlePointerUp = () => finishStroke();

  const undo = () => {
    const next = strokes.slice(0, -1);
    setStrokes(next);
    setCandidates([]);
    redraw(next, null);
  };

  const clear = () => {
    setStrokes([]);
    setActiveStroke(null);
    setCandidates([]);
    redraw([], null);
  };

  const recognize = async () => {
    if (strokes.length === 0) return;
    setRecognizing(true);
    try {
      const result = await recognizeJapaneseStrokes(strokes.map((points) => ({ points })));
      setCandidates(result.candidates);
    } finally {
      setRecognizing(false);
    }
  };

  return (
    <div className="japanese-handwriting">
      <div className="japanese-handwriting-toolbar">
        <button type="button" className="japanese-stroke-btn" onClick={undo} disabled={strokes.length === 0}>
          Undo
        </button>
        <button type="button" className="japanese-stroke-btn" onClick={clear} disabled={strokes.length === 0}>
          Clear
        </button>
        <button type="button" className="japanese-stroke-btn" onClick={recognize} disabled={strokes.length === 0 || recognizing}>
          {recognizing ? "Matching…" : "Find kanji"}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="japanese-handwriting-canvas"
        width={220}
        height={220}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {candidates.length > 0 ? (
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
