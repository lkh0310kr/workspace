import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Shared lightweight popover used by SettingsDialog/AppSettingsDialog/
// PanePicker — replaces the old pattern each of those had independently
// (a full-screen dimmed backdrop + a centered modal box). Positions itself
// next to whatever triggered it instead of centering, and doesn't dim the
// rest of the screen — "Pane UX를 Dialog -> 가벼운 Popover로 변경".
//
// Still uses a full-screen (but transparent) click-catcher behind the
// popover content, same mechanism the old backdrop used: without it,
// clicking the trigger button again to close would hit a document-level
// outside-click listener on mousedown (which fires before click) that
// closes the popover, and then the trigger's own onClick — still to
// come, since mousedown != click — would immediately reopen it. A
// catcher positioned above the trigger consumes that second click
// entirely, so the trigger's own handler never re-fires.
// A real DOMRect satisfies this structurally, but so does a plain literal
// (e.g. a zero-size rect built from a context-menu click position) —
// narrower than DOMRect on purpose so callers without a real element to
// measure don't need to fake DOMRect's toJSON() too.
export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface Props {
  anchorRect: AnchorRect;
  onClose: () => void;
  children: ReactNode;
  /** Aligns the popover's right edge to the anchor's right edge instead
   * of left-aligning — for triggers near the right side of the window. */
  align?: "start" | "end";
  className?: string;
}

export function Popover({ anchorRect, onClose, children, align = "start", className }: Props) {
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

  return createPortal(
    <div className="popover-catcher" onClick={onClose}>
      <div
        ref={ref}
        className={`popover${className ? ` ${className}` : ""}`}
        style={{ top: pos.top, left: pos.left, opacity: pos.ready ? 1 : 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
