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

interface Props {
  anchorRect: AnchorRect;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  /** false for hover popovers — no outside-click listener (see
   * SidebarQuickSwitchPopover). */
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
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!dismissOnClickOutside) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // Ignore presses on the trigger rect so toggle buttons (settings, +)
      // can close via their own click handler without pointerdown reopen races.
      if (pointInRect(e.clientX, e.clientY, anchorRect)) return;
      onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose, dismissOnClickOutside, anchorRect]);

  useLayoutEffect(() => {
    return interactionCoordinator.registerPortal(portalId, onClose);
  }, [portalId, onClose]);

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
