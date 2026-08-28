import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";

// Lightweight popover anchored to a trigger rect. Portals to document.body
// but deliberately does NOT use a full-screen click-catcher — those
// catchers (z-index 100000, inset:0) were the root cause of "workspace tab
// switch kills all interaction": every workspace tab stays mounted, so a
// Popover opened in tab A's pane survives the switch as an invisible layer
// blocking the entire app (including the tab rail) until manually dismissed.
// Outside-click dismissal is a document-level pointerdown listener instead.
export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function pointInRect(x: number, y: number, rect: AnchorRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Exported for tests — true when an outside pointerdown should dismiss this popover. */
export function shouldDismissPopoverPointerDown(
  target: Node | null,
  popoverRoot: HTMLElement | null,
  clientX: number,
  clientY: number,
  anchorRect: AnchorRect,
): boolean {
  if (!target) return true;
  if (popoverRoot?.contains(target)) return false;
  // Nested portaled UI (context menus, stacked settings popovers) lives outside
  // this popover's ref — without this, opening workspace tab settings from the
  // rail context menu dismisses the rail on pointerdown before the click lands.
  const el = target as Element;
  if (typeof el.closest === "function" && el.closest(".popover, .context-menu")) return false;
  if (pointInRect(clientX, clientY, anchorRect)) return false;
  return true;
}

interface Props {
  anchorRect: AnchorRect;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  /** false for hover-only popovers — no outside-click listener. */
  dismissOnClickOutside?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function Popover({
  anchorRect,
  onClose,
  children,
  align = "start",
  className,
  dismissOnClickOutside = true,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const portalId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false,
  });
  // Why: callers routinely pass an inline `() => setX(null)` onClose, a new
  // identity every render. registerPortal's cleanup+re-register on identity
  // change calls interactionCoordinator.reconcile(), which notifies every
  // subscriber (e.g. usePaneVisibility) and forces a re-render — feeding
  // right back into a new onClose identity. A ref keeps every effect below
  // mount-stable regardless of the caller's callback stability.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = align === "end" ? anchorRect.right - rect.width : anchorRect.left;
    left = Math.min(Math.max(left, margin), window.innerWidth - rect.width - margin);
    let top = anchorRect.bottom + 6;
    if (top + rect.height > window.innerHeight - margin) {
      top = anchorRect.top - rect.height - 6;
    }
    top = Math.max(top, margin);
    setPos({ top, left, ready: true });
  }, [anchorRect, align]);

  useLayoutEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useLayoutEffect(() => {
    if (!dismissOnClickOutside) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        !shouldDismissPopoverPointerDown(
          e.target as Node,
          ref.current,
          e.clientX,
          e.clientY,
          anchorRect,
        )
      ) {
        return;
      }
      onCloseRef.current();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [dismissOnClickOutside, anchorRect]);

  useLayoutEffect(() => {
    return interactionCoordinator.registerPortal(portalId, () => onCloseRef.current());
  }, [portalId]);

  const panel = (
    <div
      ref={ref}
      className={`popover${className ? ` ${className}` : ""}`}
      style={{ top: pos.top, left: pos.left, opacity: pos.ready ? 1 : 0 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );

  return createPortal(panel, document.body);
}
