import { describe, expect, it } from "vitest";
import {
  flattenSvgPath,
  isHanKanjiLiteral,
  normalizeStrokes,
  rankKanjiMatches,
  sampleSvgPath,
  type KanjiStrokeReference,
} from "./strokeMatch";

const KANJIVG_一 =
  "M11,54.25c3.19,0.62,6.25,0.75,9.73,0.5c20.64-1.5,50.39-5.12,68.58-5.24c3.6-0.02,5.77,0.24,7.57,0.49";

describe("strokeMatch", () => {
  it("samples simple line svg paths", () => {
    const points = sampleSvgPath("M10,10 L90,10", 4);
    expect(points.length).toBe(4);
    expect(points[0].x).toBeCloseTo(10, 0);
    expect(points[3].x).toBeCloseTo(90, 0);
  });

  it("flattens KanjiVG cubic paths for 一", () => {
    const flat = flattenSvgPath(KANJIVG_一);
    expect(flat.length).toBeGreaterThan(8);
    expect(flat[0].x).toBeCloseTo(11, 0);
    expect(flat[flat.length - 1].x).toBeGreaterThan(80);
    const ys = flat.map((point) => point.y);
    const spread = Math.max(...ys) - Math.min(...ys);
    expect(spread).toBeLessThan(8);
  });

  it("ranks 一 highest for a horizontal stroke using real KanjiVG data", () => {
    const user = [{ points: [{ x: 10, y: 54 }, { x: 90, y: 54 }] }];
    const references: KanjiStrokeReference[] = [
      { literal: "一", strokes: [sampleSvgPath(KANJIVG_一)] },
      { literal: "丨", strokes: [sampleSvgPath("M54.5,11.5c0.5,3.5,0.5,7.25,0.5,10.75c0,20.75,0,50.5,0,68.75")] },
      { literal: "へ", strokes: normalizeStrokes([[{ x: 10, y: 70 }, { x: 50, y: 40 }, { x: 90, y: 70 }]]) },
      { literal: "U", strokes: normalizeStrokes([[{ x: 20, y: 20 }, { x: 80, y: 20 }]]) },
    ];
    const ranked = rankKanjiMatches(user, references, 4);
    expect(ranked[0]?.literal).toBe("一");
    expect(ranked[0]?.score).toBeGreaterThan(0.35);
  });

  it("ranks closer kanji references higher", () => {
    const user = [{ points: [{ x: 10, y: 10 }, { x: 90, y: 10 }] }];
    const references: KanjiStrokeReference[] = [
      { literal: "一", strokes: normalizeStrokes([[{ x: 12, y: 20 }, { x: 88, y: 20 }]]) },
      { literal: "食", strokes: normalizeStrokes([[{ x: 10, y: 10 }, { x: 10, y: 90 }]]) },
    ];
    const ranked = rankKanjiMatches(user, references, 2);
    expect(ranked[0]?.literal).toBe("一");
  });

  it("handles a very short stroke without throwing", () => {
    const user = [{ points: [{ x: 10, y: 55 }, { x: 90, y: 55 }] }];
    const references: KanjiStrokeReference[] = [
      { literal: "一", strokes: normalizeStrokes([[{ x: 12, y: 50 }, { x: 88, y: 50 }]]) },
    ];
    expect(() => rankKanjiMatches(user, references, 1)).not.toThrow();
    expect(rankKanjiMatches(user, references, 1)[0]?.literal).toBe("一");
  });

  it("filters handwriting candidates to Han characters", () => {
    expect(isHanKanjiLiteral("一")).toBe(true);
    expect(isHanKanjiLiteral("へ")).toBe(false);
    expect(isHanKanjiLiteral("U")).toBe(false);
  });
});
