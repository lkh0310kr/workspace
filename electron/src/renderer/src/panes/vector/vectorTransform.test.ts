import { describe, it, expect } from "vitest";
import { createEllipse, createGroup, createRect, createText } from "./sceneGraph";
import {
  localBounds,
  boundsCenter,
  boundsIntersect,
  toLocalPoint,
  documentBounds,
  documentCenter,
  documentCorners,
  hitTest,
  moveBy,
  rotateTo,
  scaleTo,
  resizeTransform,
  pointerAngleDegrees,
  rotationFromDrag,
  handleLocalPoint,
  oppositeHandle,
} from "./vectorTransform";

describe("localBounds", () => {
  it("matches x/y/width/height for a rect", () => {
    expect(localBounds(createRect(10, 20, 100, 50))).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("derives a bounding box from center+radii for an ellipse", () => {
    expect(localBounds(createEllipse(50, 40, 20, 10))).toEqual({ x: 30, y: 30, width: 40, height: 20 });
  });

  it("is the union of children's document bounds for a group", () => {
    const group = createGroup([createRect(0, 0, 10, 10), createRect(50, 50, 10, 10)]);
    expect(localBounds(group)).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });

  it("accounts for a child's own transform when computing a group's bounds", () => {
    const moved = { ...createRect(0, 0, 10, 10), transform: { x: 100, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } };
    const group = createGroup([createRect(0, 0, 10, 10), moved]);
    expect(localBounds(group)).toEqual({ x: 0, y: 0, width: 110, height: 10 });
  });

  it("is a zero-size box for an empty group", () => {
    expect(localBounds(createGroup([]))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("approximates a text object's box from its fontSize and content length", () => {
    const text = createText(10, 20, "Hi");
    const b = localBounds(text);
    expect(b.x).toBe(10);
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThan(0);
    // Longer content -> wider box, same fontSize.
    const longer = createText(10, 20, "Much longer text");
    expect(localBounds(longer).width).toBeGreaterThan(b.width);
  });
});

describe("boundsCenter", () => {
  it("is the midpoint of the box", () => {
    expect(boundsCenter({ x: 0, y: 0, width: 100, height: 50 })).toEqual({ x: 50, y: 25 });
  });
});

describe("boundsIntersect", () => {
  const box = { x: 0, y: 0, width: 100, height: 50 };

  it("is true for overlapping boxes", () => {
    expect(boundsIntersect(box, { x: 50, y: 25, width: 100, height: 50 })).toBe(true);
  });

  it("is false for boxes that don't touch", () => {
    expect(boundsIntersect(box, { x: 200, y: 200, width: 10, height: 10 })).toBe(false);
  });

  it("is false for boxes that only touch at an edge (no area overlap)", () => {
    expect(boundsIntersect(box, { x: 100, y: 0, width: 50, height: 50 })).toBe(false);
  });
});

describe("hitTest — identity transform", () => {
  const rect = createRect(0, 0, 100, 50);
  const ellipse = createEllipse(50, 50, 20, 10);

  it("hits inside a rect", () => {
    expect(hitTest(rect, { x: 50, y: 25 })).toBe(true);
  });

  it("misses outside a rect", () => {
    expect(hitTest(rect, { x: 200, y: 200 })).toBe(false);
  });

  it("hits the center of an ellipse", () => {
    expect(hitTest(ellipse, { x: 50, y: 50 })).toBe(true);
  });

  it("misses an ellipse's corner (inside its bounding box, outside the ellipse itself)", () => {
    // Bounding box corner (30,40) is outside the ellipse (rx=20,ry=10) —
    // classic case a naive bbox-only hit test would get wrong.
    expect(hitTest(ellipse, { x: 30, y: 40 })).toBe(false);
  });
});

describe("hitTest — text (bounding-box fallback)", () => {
  it("hits inside the approximated box, misses well outside it", () => {
    const text = createText(0, 0, "Hi");
    const bounds = localBounds(text);
    expect(hitTest(text, boundsCenter(bounds))).toBe(true);
    expect(hitTest(text, { x: bounds.x + 10000, y: bounds.y + 10000 })).toBe(false);
  });
});

describe("hitTest — translated transform", () => {
  it("hits at the translated position, not the original one", () => {
    const rect = { ...createRect(0, 0, 100, 50), transform: { x: 200, y: 200, scaleX: 1, scaleY: 1, rotation: 0 } };
    expect(hitTest(rect, { x: 250, y: 225 })).toBe(true);
    expect(hitTest(rect, { x: 50, y: 25 })).toBe(false);
  });
});

describe("hitTest — rotated transform", () => {
  it("a point that would be inside an unrotated wide rect is outside once rotated 90°", () => {
    // Wide rect (200x20) centered at (100,10) — far-right edge point.
    const rect = createRect(0, 0, 200, 20);
    const rotated = { ...rect, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90 } };
    expect(hitTest(rect, { x: 190, y: 10 })).toBe(true);
    expect(hitTest(rotated, { x: 190, y: 10 })).toBe(false);
    // After a 90° rotation about the center (100,10), that same local
    // point now sits near (100, 100) in document space.
    expect(hitTest(rotated, { x: 100, y: 100 })).toBe(true);
  });
});

describe("toLocalPoint", () => {
  it("is the identity when transform is untouched", () => {
    const rect = createRect(10, 10, 50, 50);
    expect(toLocalPoint({ x: 30, y: 30 }, rect)).toEqual({ x: 30, y: 30 });
  });
});

describe("documentBounds", () => {
  it("matches localBounds when the transform is identity", () => {
    const rect = createRect(5, 5, 40, 20);
    expect(documentBounds(rect)).toEqual(localBounds(rect));
  });

  it("shifts by the translation", () => {
    const rect = { ...createRect(0, 0, 40, 20), transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0 } };
    expect(documentBounds(rect)).toEqual({ x: 100, y: 50, width: 40, height: 20 });
  });
});

describe("handleLocalPoint / oppositeHandle", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 50 };

  it("places corner handles at the box's corners", () => {
    expect(handleLocalPoint(bounds, "nw")).toEqual({ x: 0, y: 0 });
    expect(handleLocalPoint(bounds, "se")).toEqual({ x: 100, y: 50 });
  });

  it("places edge handles at the midpoint of that edge", () => {
    expect(handleLocalPoint(bounds, "n")).toEqual({ x: 50, y: 0 });
    expect(handleLocalPoint(bounds, "e")).toEqual({ x: 100, y: 25 });
  });

  it("opposites every handle correctly", () => {
    expect(oppositeHandle("nw")).toBe("se");
    expect(oppositeHandle("n")).toBe("s");
    expect(oppositeHandle("e")).toBe("w");
  });
});

describe("resizeTransform — anchor invariance", () => {
  it("dragging a corner keeps the opposite corner's document position fixed (no rotation)", () => {
    const rect = createRect(0, 0, 100, 100);
    const nextT = resizeTransform(rect, "se", { x: 300, y: 250 });
    const resized = { ...rect, transform: nextT };
    // Anchor corner ("nw", local (0,0)) started at document (0,0) and
    // should stay there regardless of how far "se" was dragged.
    const bounds = documentBounds(resized);
    expect(bounds.x).toBeCloseTo(0, 5);
    expect(bounds.y).toBeCloseTo(0, 5);
  });

  it("dragging a corner keeps the opposite corner fixed even when rotated", () => {
    const base = createRect(0, 0, 100, 100);
    const rotated = { ...base, transform: { ...base.transform, rotation: 37 } };
    // Anchor ("nw") document position before resizing.
    const cornersBefore = documentCorners(rotated); // order: nw, ne, se, sw
    const nwBefore = cornersBefore[0];

    const resized = { ...rotated, transform: resizeTransform(rotated, "se", { x: 400, y: 400 }) };
    const cornersAfter = documentCorners(resized);
    const nwAfter = cornersAfter[0];

    expect(nwAfter.x).toBeCloseTo(nwBefore.x, 5);
    expect(nwAfter.y).toBeCloseTo(nwBefore.y, 5);
  });

  it("an edge handle only changes that axis's scale", () => {
    const rect = createRect(0, 0, 100, 50);
    const t = resizeTransform(rect, "e", { x: 300, y: 25 });
    expect(t.scaleY).toBe(1);
    expect(t.scaleX).toBeGreaterThan(1);
  });
});

describe("documentCenter", () => {
  it("is the local center plus translation", () => {
    const rect = { ...createRect(0, 0, 100, 100), transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 } };
    expect(documentCenter(rect)).toEqual({ x: 60, y: 70 });
  });
});

describe("pointerAngleDegrees", () => {
  it("is 0 when the pointer is directly right of center", () => {
    expect(pointerAngleDegrees({ x: 50, y: 50 }, { x: 150, y: 50 })).toBeCloseTo(0, 5);
  });

  it("is 90 when the pointer is directly below center (SVG's y-down convention)", () => {
    expect(pointerAngleDegrees({ x: 50, y: 50 }, { x: 50, y: 150 })).toBeCloseTo(90, 5);
  });
});

describe("rotationFromDrag", () => {
  // Ported approach from tldraw's Rotating.ts (see vectorTransform.ts's
  // doc comment) — rotation is startRotation + the *change* in pointer
  // angle, not the pointer's absolute angle. Grabbing the handle
  // slightly off from its exact rendered position must not snap the
  // shape to a new rotation the instant the drag starts.
  it("is unchanged when the pointer hasn't moved", () => {
    expect(rotationFromDrag(15, 40, 40)).toBe(15);
  });

  it("applies only the angle delta, not the absolute angle", () => {
    // Grabbed the handle 10° off from its nominal position (startAngle
    // 40 instead of the "true" 0), then dragged another 20°.
    expect(rotationFromDrag(15, 40, 60)).toBe(35);
  });

  it("wraps naturally through 0/360 since it's a plain sum, not a mod", () => {
    expect(rotationFromDrag(350, 10, 20)).toBe(360);
  });
});

describe("moveBy / rotateTo / scaleTo", () => {
  const base = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

  it("moveBy adds a document-space delta", () => {
    expect(moveBy(base, 10, -5)).toEqual({ ...base, x: 10, y: -5 });
  });

  it("rotateTo sets an absolute rotation", () => {
    expect(rotateTo(base, 45).rotation).toBe(45);
  });

  it("scaleTo sets absolute scale factors", () => {
    expect(scaleTo(base, 2, 0.5)).toMatchObject({ scaleX: 2, scaleY: 0.5 });
  });
});
