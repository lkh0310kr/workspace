/**
 * WSLg RDP input relay: press/release often arrive as `mouse` while motion
 * uses a different `pen` pointerId (ref-proj/orca pane-divider-drag.ts).
 */
export type ActivePointerDragState = {
  pointerId: number;
  pointerType: string;
};

export function isActivePointerDragEvent(
  e: Pick<PointerEvent, "pointerId" | "pointerType" | "isPrimary">,
  active: ActivePointerDragState | null,
): boolean {
  if (!active) return false;
  return (
    e.pointerId === active.pointerId ||
    (e.isPrimary && e.pointerType !== "touch" && active.pointerType !== "touch")
  );
}
