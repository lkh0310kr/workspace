import { describe, it, expect } from "vitest";
import { anchorsToPathData, mirroredHandle } from "./bezierPath";
import type { PathAnchor } from "./sceneGraph";

describe("anchorsToPathData", () => {
  it("returns empty string for no anchors", () => {
    expect(anchorsToPathData([], false)).toBe("");
  });

  it("a single anchor is just a moveto", () => {
    expect(anchorsToPathData([{ x: 5, y: 10 }], false)).toBe("M 5 10");
  });

  it("two corner anchors (no handles) produce a straight line segment", () => {
    const anchors: PathAnchor[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(anchorsToPathData(anchors, false)).toBe("M 0 0 L 100 0");
  });

  it("a smooth anchor with an out-handle produces a cubic curve", () => {
    const anchors: PathAnchor[] = [
      { x: 0, y: 0, outHandle: { x: 20, y: 0 } },
      { x: 100, y: 0, inHandle: { x: 80, y: 0 } },
    ];
    expect(anchorsToPathData(anchors, false)).toBe("M 0 0 C 20 0 80 0 100 0");
  });

  it("a one-sided handle still curves (the missing side falls back to the anchor point)", () => {
    const anchors: PathAnchor[] = [{ x: 0, y: 0, outHandle: { x: 20, y: 10 } }, { x: 100, y: 0 }];
    expect(anchorsToPathData(anchors, false)).toBe("M 0 0 C 20 10 100 0 100 0");
  });

  it("closes the path with Z when closed, connecting last anchor back to first", () => {
    const anchors: PathAnchor[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
    expect(anchorsToPathData(anchors, true)).toBe("M 0 0 L 100 0 L 50 100 L 0 0 Z");
  });

  it("does not close (no Z, no closing segment) when closed=false", () => {
    const anchors: PathAnchor[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
    expect(anchorsToPathData(anchors, false)).toBe("M 0 0 L 100 0 L 50 100");
  });
});

describe("mirroredHandle", () => {
  it("reflects the out-handle through the anchor point to get the in-handle", () => {
    expect(mirroredHandle({ x: 50, y: 50 }, { x: 70, y: 50 })).toEqual({ x: 30, y: 50 });
  });

  it("works for a diagonal handle too", () => {
    expect(mirroredHandle({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: -10, y: -20 });
  });
});
