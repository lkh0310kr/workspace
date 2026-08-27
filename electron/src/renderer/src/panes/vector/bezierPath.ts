// Anchor list -> SVG path `d` string. The anchor list (position + optional
// in/out bezier handles per point) is the document's source of truth —
// see sceneGraph.ts's PathAnchor doc comment — this is purely a rendering
// projection of it, computed fresh every render rather than cached.

import type { PathAnchor } from "./sceneGraph";

function segmentCommand(from: PathAnchor, to: PathAnchor): string {
  // A straight segment (both anchors are plain corner points, no handles
  // pulled out) renders as a line, not a degenerate curve — matches how
  // every real vector editor treats an un-dragged pen click.
  if (!from.outHandle && !to.inHandle) {
    return `L ${to.x} ${to.y}`;
  }
  const c1 = from.outHandle ?? { x: from.x, y: from.y };
  const c2 = to.inHandle ?? { x: to.x, y: to.y };
  return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
}

export function anchorsToPathData(anchors: PathAnchor[], closed: boolean): string {
  if (anchors.length === 0) return "";
  if (anchors.length === 1) return `M ${anchors[0].x} ${anchors[0].y}`;

  const parts: string[] = [`M ${anchors[0].x} ${anchors[0].y}`];
  for (let i = 1; i < anchors.length; i++) {
    parts.push(segmentCommand(anchors[i - 1], anchors[i]));
  }
  if (closed) {
    parts.push(segmentCommand(anchors[anchors.length - 1], anchors[0]));
    parts.push("Z");
  }
  return parts.join(" ");
}

/** A symmetric smooth anchor: dragging out an out-handle while placing a
 * point mirrors it as the in-handle (Illustrator's default click+drag
 * pen behavior — Alt/Option-drag for an independent handle is a later
 * polish item, not in this pass). */
export function mirroredHandle(
  anchorPoint: { x: number; y: number },
  outHandle: { x: number; y: number },
): { x: number; y: number } {
  return { x: anchorPoint.x - (outHandle.x - anchorPoint.x), y: anchorPoint.y - (outHandle.y - anchorPoint.y) };
}
