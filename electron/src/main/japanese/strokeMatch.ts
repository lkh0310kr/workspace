export interface StrokePoint {
  x: number;
  y: number;
}

export interface UserStrokeInput {
  points: StrokePoint[];
}

const VIEWBOX_SIZE = 109;

function pathNumbers(path: string): number[] {
  return (path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

export function sampleSvgPath(path: string, samples = 24): StrokePoint[] {
  const numbers = pathNumbers(path);
  if (numbers.length < 2) return [];

  const points: StrokePoint[] = [{ x: numbers[0], y: numbers[1] }];
  for (let i = 2; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  if (points.length === 1 && numbers.length >= 4) {
    points.push({ x: numbers[2], y: numbers[3] });
  }

  if (points.length <= 1) return points;

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    lengths.push(len);
    total += len;
  }
  if (total === 0) {
    return Array.from({ length: samples }, () => ({ x: points[0].x, y: points[0].y }));
  }

  const sampled: StrokePoint[] = [];
  for (let s = 0; s < samples; s += 1) {
    const target = (total * s) / (samples - 1 || 1);
    let walked = 0;
    let point: StrokePoint | null = null;
    for (let i = 1; i < points.length; i += 1) {
      const seg = lengths[i - 1];
      if (walked + seg >= target) {
        const t = seg === 0 ? 0 : (target - walked) / seg;
        point = {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
        };
        break;
      }
      walked += seg;
    }
    sampled.push(point ?? points[points.length - 1]);
  }
  return sampled;
}

function boundingBox(strokes: StrokePoint[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

export function normalizeStrokes(strokes: StrokePoint[][], size = VIEWBOX_SIZE): StrokePoint[][] {
  const box = boundingBox(strokes);
  const width = Math.max(box.maxX - box.minX, 1);
  const height = Math.max(box.maxY - box.minY, 1);
  const scale = (size * 0.85) / Math.max(width, height);
  const offsetX = (size - width * scale) / 2;
  const offsetY = (size - height * scale) / 2;
  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: (point.x - box.minX) * scale + offsetX,
      y: (point.y - box.minY) * scale + offsetY,
    })),
  );
}

function resampleStroke(stroke: StrokePoint[], count: number): StrokePoint[] {
  if (count <= 0) return [];
  if (stroke.length === 0) return Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  if (stroke.length === 1) return Array.from({ length: count }, () => stroke[0]);
  const sampled = sampleSvgPath(
    `M ${stroke.map((point) => `${point.x} ${point.y}`).join(" L ")}`,
    count,
  );
  if (sampled.length === count) return sampled;
  if (sampled.length === 0) return Array.from({ length: count }, () => stroke[0]);
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    const pick = Math.min(Math.round(t * (sampled.length - 1)), sampled.length - 1);
    return sampled[pick];
  });
}

function strokeDistance(a: StrokePoint[], b: StrokePoint[]): number {
  const count = 24;
  const aNorm = resampleStroke(a, count);
  const bNorm = resampleStroke(b, count);
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    sum += Math.hypot(aNorm[i].x - bNorm[i].x, aNorm[i].y - bNorm[i].y);
  }
  return sum / count;
}

function matchStrokeSets(user: StrokePoint[][], reference: StrokePoint[][]): number {
  if (user.length === 0 || reference.length === 0) return Number.POSITIVE_INFINITY;
  const countPenalty = Math.abs(user.length - reference.length) * 12;
  const pairCount = Math.min(user.length, reference.length);
  let total = countPenalty;
  for (let i = 0; i < pairCount; i += 1) {
    total += strokeDistance(user[i], reference[i]);
  }
  return total / pairCount;
}

export interface KanjiStrokeReference {
  literal: string;
  strokes: StrokePoint[][];
}

export function scoreKanjiMatch(userStrokes: UserStrokeInput[], reference: KanjiStrokeReference): number {
  const user = normalizeStrokes(userStrokes.map((stroke) => stroke.points));
  const ref = normalizeStrokes(reference.strokes);
  const distance = matchStrokeSets(user, ref);
  return 1 / (1 + distance);
}

export function sanitizeUserStrokes(userStrokes: UserStrokeInput[]): UserStrokeInput[] {
  return userStrokes
    .map((stroke) => ({
      points: (stroke?.points ?? []).filter(
        (point): point is StrokePoint =>
          point != null && Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
    }))
    .filter((stroke) => stroke.points.length > 0);
}

export function rankKanjiMatches(
  userStrokes: UserStrokeInput[],
  references: KanjiStrokeReference[],
  limit = 10,
): { literal: string; score: number }[] {
  const sanitized = sanitizeUserStrokes(userStrokes);
  if (sanitized.length === 0) return [];
  return references
    .map((reference) => ({ literal: reference.literal, score: scoreKanjiMatch(sanitized, reference) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
