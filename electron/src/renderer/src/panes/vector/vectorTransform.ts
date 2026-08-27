// Bounding-box + transform math for M1 (Rect/Ellipse only — Line/Path/
// Text/Group bounds land in later milestones alongside their tools).
//
// Model: an object's own geometry (x/y/width/height, cx/cy/rx/ry) is
// authored directly in local space — dragging out a new rect just sets
// x/y/width/height, Transform starts at identity. Transform only
// accumulates once the user moves/resizes/rotates an *existing* object,
// pivoting around the object's own local bounding-box center (matches
// every mainstream vector editor's default rotate/scale-from-center
// behavior). Rendering and hit-testing both compose the same pivot
// formula, so they can never disagree about where a shape actually is.

import type { EllipseObject, RectObject, Transform } from "./sceneGraph";

export type TransformableObject = RectObject | EllipseObject;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Untransformed local bounding box — before Transform is applied. */
export function localBounds(obj: TransformableObject): Bounds {
  if (obj.type === "rect") return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
  return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, width: obj.rx * 2, height: obj.ry * 2 };
}

export function boundsCenter(b: Bounds): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** SVG `transform` attribute value: translate, then rotate+scale about the
 * shape's own local center. Order matters — translate must be outermost
 * so `transform.x/y` always means "move by this much in document space"
 * regardless of the shape's own rotation/scale. */
export function svgTransform(obj: TransformableObject): string {
  const t = obj.transform;
  const c = boundsCenter(localBounds(obj));
  return (
    `translate(${t.x} ${t.y}) ` +
    `translate(${c.x} ${c.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY}) translate(${-c.x} ${-c.y})`
  );
}

/** Inverse of svgTransform — maps a document-space point into the
 * object's local (pre-transform) space, for hit-testing and drag math. */
export function toLocalPoint(point: Point, obj: TransformableObject): Point {
  const t = obj.transform;
  const c = boundsCenter(localBounds(obj));
  // Undo translate.
  let x = point.x - t.x;
  let y = point.y - t.y;
  // Undo the pivot-about-center rotate+scale, in reverse order.
  x -= c.x;
  y -= c.y;
  const rad = (-t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  x = rx / (t.scaleX || 1);
  y = ry / (t.scaleY || 1);
  x += c.x;
  y += c.y;
  return { x, y };
}

/** Forward-transforms a *local* point (in the same pre-transform space as
 * the object's own geometry) into document space — scale then rotate
 * about the object's local center, then translate. The forward version of
 * toLocalPoint's inverse chain; also what documentCorners and the UI's
 * resize/rotate handle positions are built from. */
export function toDocumentPoint(local: Point, obj: TransformableObject): Point {
  const t = obj.transform;
  const c = boundsCenter(localBounds(obj));
  const sx = c.x + (local.x - c.x) * t.scaleX;
  const sy = c.y + (local.y - c.y) * t.scaleY;
  const dx = sx - c.x;
  const dy = sy - c.y;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: c.x + dx * cos - dy * sin + t.x, y: c.y + dx * sin + dy * cos + t.y };
}

/** The 4 corners of the local bounding box, transformed to document
 * space — used to draw the (possibly rotated) selection outline for an
 * object, and as the basis for documentBounds below. Order: nw, ne, se,
 * sw. */
export function documentCorners(obj: TransformableObject): Point[] {
  const b = localBounds(obj);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => toDocumentPoint(p, obj));
}

/** Axis-aligned bounding box of the (possibly rotated) object in document
 * space — what the selection outline and marquee-intersection use. */
export function documentBounds(obj: TransformableObject): Bounds {
  const corners = documentCorners(obj);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Point-in-shape test, in document space. */
export function hitTest(obj: TransformableObject, point: Point): boolean {
  const local = toLocalPoint(point, obj);
  if (obj.type === "rect") {
    return local.x >= obj.x && local.x <= obj.x + obj.width && local.y >= obj.y && local.y <= obj.y + obj.height;
  }
  const nx = (local.x - obj.cx) / (obj.rx || 1);
  const ny = (local.y - obj.cy) / (obj.ry || 1);
  return nx * nx + ny * ny <= 1;
}

/** Applies a document-space drag delta as a move — the common case (no
 * resize/rotate), used while dragging the shape body itself. */
export function moveBy(transform: Transform, dx: number, dy: number): Transform {
  return { ...transform, x: transform.x + dx, y: transform.y + dy };
}

export function rotateTo(transform: Transform, degrees: number): Transform {
  return { ...transform, rotation: degrees };
}

export function scaleTo(transform: Transform, scaleX: number, scaleY: number): Transform {
  return { ...transform, scaleX, scaleY };
}

/** The 8 resize-handle positions around a bounding box's edge. Corner
 * handles resize both axes; edge handles ("n"/"s"/"e"/"w") resize one. */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const OPPOSITE_HANDLE: Record<HandleId, HandleId> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

export function oppositeHandle(handle: HandleId): HandleId {
  return OPPOSITE_HANDLE[handle];
}

/** Where a handle sits on the *local* (pre-scale, pre-rotate) bounding
 * box. */
export function handleLocalPoint(bounds: Bounds, handle: HandleId): Point {
  const midX = bounds.x + bounds.width / 2;
  const midY = bounds.y + bounds.height / 2;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  switch (handle) {
    case "nw":
      return { x: bounds.x, y: bounds.y };
    case "n":
      return { x: midX, y: bounds.y };
    case "ne":
      return { x: right, y: bounds.y };
    case "e":
      return { x: right, y: midY };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: midX, y: bottom };
    case "sw":
      return { x: bounds.x, y: bottom };
    case "w":
      return { x: bounds.x, y: midY };
  }
}

/** The object's local center, mapped to document space — the one point a
 * pure rotate+scale never moves (only the translate does). Used as the
 * pivot for the rotate handle. */
export function documentCenter(obj: TransformableObject): Point {
  const c = boundsCenter(localBounds(obj));
  return { x: c.x + obj.transform.x, y: c.y + obj.transform.y };
}

/** Undoes translate and rotate (about the local center) but *not* scale —
 * the intermediate space resizeTransform's math works in, since scale is
 * exactly the thing being solved for. */
function toRotationLocalPoint(point: Point, transform: Transform, center: Point): Point {
  const x = point.x - transform.x - center.x;
  const y = point.y - transform.y - center.y;
  const rad = (-transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin + center.x, y: x * sin + y * cos + center.y };
}

/** Resizes by dragging `handle` to `mouseDocPoint`, keeping the opposite
 * handle's *document-space* position fixed (the standard "drag a corner,
 * the other corner stays put" behavior) — works at any rotation, since
 * the compensating translation accounts for it. Corner handles resize
 * both axes; edge handles resize only their axis. Expressed as scaleX/
 * scaleY (not baked into the object's own x/y/width/height), matching
 * this module's "Transform accumulates on top of authored geometry"
 * model. */
export function resizeTransform(obj: TransformableObject, handle: HandleId, mouseDocPoint: Point): Transform {
  const bounds = localBounds(obj);
  const c = boundsCenter(bounds);
  const t = obj.transform;

  const draggedLocal = handleLocalPoint(bounds, handle);
  const anchorLocal = handleLocalPoint(bounds, oppositeHandle(handle));
  const draggedOffset = { x: draggedLocal.x - c.x, y: draggedLocal.y - c.y };
  const anchorOffset = { x: anchorLocal.x - c.x, y: anchorLocal.y - c.y };

  const rotLocal = toRotationLocalPoint(mouseDocPoint, t, c);
  const draggedVecScaled = { x: rotLocal.x - c.x, y: rotLocal.y - c.y };

  let scaleX = t.scaleX;
  let scaleY = t.scaleY;
  const resizesX = handle !== "n" && handle !== "s";
  const resizesY = handle !== "e" && handle !== "w";
  if (resizesX && draggedOffset.x !== 0) scaleX = draggedVecScaled.x / draggedOffset.x;
  if (resizesY && draggedOffset.y !== 0) scaleY = draggedVecScaled.y / draggedOffset.y;

  // Compensating translation so the anchor corner's document position is
  // unchanged by the new scale — see this file's header for the
  // derivation (scale-about-arbitrary-point identity).
  const oldScaled = { x: t.scaleX * anchorOffset.x, y: t.scaleY * anchorOffset.y };
  const newScaled = { x: scaleX * anchorOffset.x, y: scaleY * anchorOffset.y };
  const deltaScaled = { x: oldScaled.x - newScaled.x, y: oldScaled.y - newScaled.y };
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const deltaDoc = { x: deltaScaled.x * cos - deltaScaled.y * sin, y: deltaScaled.x * sin + deltaScaled.y * cos };

  return { ...t, scaleX, scaleY, x: t.x + deltaDoc.x, y: t.y + deltaDoc.y };
}

/** Rotation angle (degrees) for a rotate-handle drag at `mouseDocPoint` —
 * 0° when the mouse is directly above the shape's document-space center
 * (where the rotate handle is drawn), increasing clockwise (SVG's
 * y-down rotate() convention). */
export function rotationForPointer(obj: TransformableObject, mouseDocPoint: Point): number {
  const center = documentCenter(obj);
  const dx = mouseDocPoint.x - center.x;
  const dy = mouseDocPoint.y - center.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
}
