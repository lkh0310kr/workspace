import { describe, expect, it } from "vitest";
import { normalizeStrokes, rankKanjiMatches, sampleSvgPath, type KanjiStrokeReference } from "./strokeMatch";

describe("strokeMatch", () => {
  it("samples svg path points", () => {
    const points = sampleSvgPath("M10,10 L90,10", 4);
    expect(points.length).toBe(4);
    expect(points[0].x).toBeCloseTo(10, 0);
    expect(points[3].x).toBeCloseTo(90, 0);
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
});
