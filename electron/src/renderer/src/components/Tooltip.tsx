import { useRef, useState, type ReactNode } from "react";

// A hover tooltip with a bold title + a smaller description line below it
// (Photoshop/Illustrator's toolbar tooltip style), for icon-only buttons
// where a plain title="" attribute's native tooltip doesn't fit both a
// name and a usage hint legibly.
//
// Deliberately NOT portaled to document.body the way Popover.tsx is —
// this is purely visual (no focus, no dismiss-on-click-outside, nothing
// that needs the portal registry's cleanup story) and toolbars in this
// app only ever sit at a pane's top edge, so plain CSS
// `position: absolute` anchored to the trigger, opening downward, never
// needs viewport-edge collision handling in practice.
interface TooltipProps {
  title: string;
  description?: string;
  children: ReactNode;
}

const SHOW_DELAY_MS = 450;

export function Tooltip({ title, description, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <span
      className="tooltip-anchor"
      onMouseEnter={() => {
        clearTimer();
        timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearTimer();
        setVisible(false);
      }}
      onMouseDown={() => {
        clearTimer();
        setVisible(false);
      }}
    >
      {children}
      {visible && (
        <span className="tooltip-bubble" role="tooltip">
          <span className="tooltip-title">{title}</span>
          {description && <span className="tooltip-description">{description}</span>}
        </span>
      )}
    </span>
  );
}
