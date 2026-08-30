export interface StrokePoint {
  x: number;
  y: number;
}

export interface UserStrokeInput {
  points: StrokePoint[];
}

const VIEWBOX_SIZE = 109;
const PATH_TOKEN_RE = /([MmZzLlHhVvCcSsQqTtAa])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
const CURVE_SAMPLES = 10;

function cubicPoint(t: number, p0: StrokePoint, p1: StrokePoint, p2: StrokePoint, p3: StrokePoint): StrokePoint {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function quadPoint(t: number, p0: StrokePoint, p1: StrokePoint, p2: StrokePoint): StrokePoint {
  const u = 1 - t;
  const tt = t * t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + tt * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + tt * p2.y,
  };
}

function tokenizeSvgPath(path: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  PATH_TOKEN_RE.lastIndex = 0;
  while ((match = PATH_TOKEN_RE.exec(path)) !== null) {
    tokens.push(match[1] || match[2]);
  }
  return tokens;
}

function isCommand(token: string): boolean {
  return /^[a-zA-Z]$/.test(token);
}

/** Flatten KanjiVG SVG path data (M/L/C/c curves) into a polyline. */
export function flattenSvgPath(path: string): StrokePoint[] {
  const tokens = tokenizeSvgPath(path);
  const polyline: StrokePoint[] = [];
  let index = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCubicControl: StrokePoint | null = null;

  const readNumber = (): number => {
    const value = Number(tokens[index]);
    index += 1;
    return value;
  };

  const hasNumber = (): boolean => index < tokens.length && !isCommand(tokens[index]);

  const pushPoint = (x: number, y: number) => {
    cx = x;
    cy = y;
    polyline.push({ x, y });
  };

  const appendCubic = (p1: StrokePoint, p2: StrokePoint, end: StrokePoint) => {
    const start = { x: cx, y: cy };
    for (let step = 1; step <= CURVE_SAMPLES; step += 1) {
      polyline.push(cubicPoint(step / CURVE_SAMPLES, start, p1, p2, end));
    }
    cx = end.x;
    cy = end.y;
    prevCubicControl = p2;
  };

  const appendQuad = (p1: StrokePoint, end: StrokePoint) => {
    const start = { x: cx, y: cy };
    for (let step = 1; step <= CURVE_SAMPLES; step += 1) {
      polyline.push(quadPoint(step / CURVE_SAMPLES, start, p1, end));
    }
    cx = end.x;
    cy = end.y;
    prevCubicControl = null;
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      cmd = tokens[index];
      index += 1;
    } else if (!cmd) {
      index += 1;
      continue;
    }

    switch (cmd) {
      case "M":
        while (hasNumber()) {
          const x = readNumber();
          const y = readNumber();
          pushPoint(x, y);
          sx = x;
          sy = y;
          cmd = "L";
        }
        break;
      case "m":
        while (hasNumber()) {
          const x = cx + readNumber();
          const y = cy + readNumber();
          pushPoint(x, y);
          sx = x;
          sy = y;
          cmd = "l";
        }
        break;
      case "L":
        while (hasNumber()) pushPoint(readNumber(), readNumber());
        break;
      case "l":
        while (hasNumber()) pushPoint(cx + readNumber(), cy + readNumber());
        break;
      case "H":
        while (hasNumber()) pushPoint(readNumber(), cy);
        break;
      case "h":
        while (hasNumber()) pushPoint(cx + readNumber(), cy);
        break;
      case "V":
        while (hasNumber()) pushPoint(cx, readNumber());
        break;
      case "v":
        while (hasNumber()) pushPoint(cx, cy + readNumber());
        break;
      case "C":
        while (hasNumber()) {
          const p1 = { x: readNumber(), y: readNumber() };
          const p2 = { x: readNumber(), y: readNumber() };
          const end = { x: readNumber(), y: readNumber() };
          appendCubic(p1, p2, end);
        }
        break;
      case "c":
        while (hasNumber()) {
          const p1 = { x: cx + readNumber(), y: cy + readNumber() };
          const p2 = { x: cx + readNumber(), y: cy + readNumber() };
          const end = { x: cx + readNumber(), y: cy + readNumber() };
          appendCubic(p1, p2, end);
        }
        break;
      case "S":
        while (hasNumber()) {
          const reflected =
            prevCubicControl != null
              ? { x: 2 * cx - prevCubicControl.x, y: 2 * cy - prevCubicControl.y }
              : { x: cx, y: cy };
          const p2 = { x: readNumber(), y: readNumber() };
          const end = { x: readNumber(), y: readNumber() };
          appendCubic(reflected, p2, end);
        }
        break;
      case "s":
        while (hasNumber()) {
          const reflected =
            prevCubicControl != null
              ? { x: 2 * cx - prevCubicControl.x, y: 2 * cy - prevCubicControl.y }
              : { x: cx, y: cy };
          const p2 = { x: cx + readNumber(), y: cy + readNumber() };
          const end = { x: cx + readNumber(), y: cy + readNumber() };
          appendCubic(reflected, p2, end);
        }
        break;
      case "Q":
        while (hasNumber()) {
          const p1 = { x: readNumber(), y: readNumber() };
          const end = { x: readNumber(), y: readNumber() };
          appendQuad(p1, end);
        }
        break;
      case "q":
        while (hasNumber()) {
          const p1 = { x: cx + readNumber(), y: cy + readNumber() };
          const end = { x: cx + readNumber(), y: cy + readNumber() };
          appendQuad(p1, end);
        }
        break;
      case "Z":
      case "z":
        if (polyline.length > 0 && (cx !== sx || cy !== sy)) {
          pushPoint(sx, sy);
        }
        prevCubicControl = null;
        break;
      default:
        if (hasNumber()) index += 1;
        break;
    }
  }

  return polyline;
}

function resamplePolyline(points: StrokePoint[], samples: number): StrokePoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: samples }, () => points[0]);

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return Array.from({ length: samples }, () => points[0]);

  const sampled: StrokePoint[] = [];
  for (let s = 0; s < samples; s += 1) {
    const target = (total * s) / (samples - 1 || 1);
    let walked = 0;
    let point: StrokePoint = points[points.length - 1];
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
    sampled.push(point);
  }
  return sampled;
}

/** Sample points along an SVG path (line or KanjiVG cubic curves). */
export function sampleSvgPath(path: string, samples = 24): StrokePoint[] {
  const flat = flattenSvgPath(path);
  if (flat.length === 0) return [];
  return resamplePolyline(flat, samples);
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
  return resamplePolyline(stroke, count);
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

export function isHanKanjiLiteral(literal: string): boolean {
  if ([...literal].length !== 1) return false;
  return /\p{Script=Han}/u.test(literal);
}

function strokeAspectRatio(strokes: StrokePoint[][]): number {
  const box = boundingBox(strokes);
  const width = Math.max(box.maxX - box.minX, 1);
  const height = Math.max(box.maxY - box.minY, 1);
  return width / height;
}

function orientationBonus(user: StrokePoint[][], reference: StrokePoint[][]): number {
  if (user.length !== 1 || reference.length !== 1) return 0;
  const userRatio = strokeAspectRatio(user);
  const refRatio = strokeAspectRatio(reference);
  const userHorizontal = userRatio >= 2;
  const refHorizontal = refRatio >= 2;
  const userVertical = userRatio <= 0.5;
  const refVertical = refRatio <= 0.5;
  if (userHorizontal && refHorizontal) return 0.2;
  if (userVertical && refVertical) return 0.2;
  return 0;
}

export function scoreKanjiMatch(userStrokes: UserStrokeInput[], reference: KanjiStrokeReference): number {
  const user = normalizeStrokes(userStrokes.map((stroke) => stroke.points));
  const ref = normalizeStrokes(reference.strokes);
  const distance = matchStrokeSets(user, ref);
  const base = 1 / (1 + distance);
  return Math.min(1, base + orientationBonus(user, ref));
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

function filterReferencesForHandwriting(
  references: KanjiStrokeReference[],
  strokeCount: number,
): KanjiStrokeReference[] {
  const han = references.filter((reference) => isHanKanjiLiteral(reference.literal));
  const exact = han.filter((reference) => reference.strokes.length === strokeCount);
  if (exact.length > 0) return exact;
  return han.filter((reference) => Math.abs(reference.strokes.length - strokeCount) <= 1);
}

export function rankKanjiMatches(
  userStrokes: UserStrokeInput[],
  references: KanjiStrokeReference[],
  limit = 10,
): { literal: string; score: number }[] {
  const sanitized = sanitizeUserStrokes(userStrokes);
  if (sanitized.length === 0) return [];

  const pool = filterReferencesForHandwriting(references, sanitized.length);
  const ranked = pool
    .map((reference) => ({ literal: reference.literal, score: scoreKanjiMatch(sanitized, reference) }))
    .filter((entry) => entry.score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
}
