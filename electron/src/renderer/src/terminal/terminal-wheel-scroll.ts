import type { Terminal } from "@xterm/xterm";

/** True when the viewport is pinned to the live output (not reading scrollback). */
export function isTerminalViewportAtBottom(terminal: Terminal): boolean {
  const buf = terminal.buffer.active;
  return buf.viewportY >= buf.baseY;
}

/** Line-based wheel delta (one notch ≈ one row). */
export function wheelDeltaToLines(terminal: Terminal, event: WheelEvent): number {
  const sensitivity = event.shiftKey
    ? (terminal.options.fastScrollSensitivity ?? 1)
    : (terminal.options.scrollSensitivity ?? 1);

  let lines: number;
  if (event.deltaMode === 1) {
    lines = Math.round(event.deltaY * sensitivity);
  } else if (event.deltaMode === 2) {
    lines = Math.round(event.deltaY * terminal.rows * sensitivity);
  } else {
    lines = Math.round((event.deltaY / 53) * sensitivity);
  }

  if (lines === 0 && event.deltaY !== 0) {
    lines = event.deltaY > 0 ? 1 : -1;
  }
  return lines;
}

/**
 * True when xterm should own wheel scroll (primary buffer with scrollback).
 * tmux panes use the alternate buffer — wheel must reach tmux instead.
 */
export function shouldXtermOwnWheelScroll(terminal: Terminal): boolean {
  return terminal.buffer?.active?.type !== "alternate";
}

/**
 * Scroll xterm viewport by whole lines on the primary buffer.
 * Returns false in alternate buffer so tmux can handle wheel (copy-mode).
 */
export function applyTerminalWheelScroll(terminal: Terminal, event: WheelEvent): boolean {
  if (event.deltaY === 0) return false;
  if (!shouldXtermOwnWheelScroll(terminal)) return false;

  const lines = wheelDeltaToLines(terminal, event);
  if (lines !== 0) {
    terminal.scrollLines(lines);
  }
  return true;
}

export function installTerminalWheelScroll(terminal: Terminal): () => void {
  const root = terminal.element;
  if (!root) return () => {};

  const onWheel = (event: WheelEvent) => {
    const consumed = applyTerminalWheelScroll(terminal, event);
    if (!consumed) return;
    event.preventDefault();
    event.stopPropagation();
  };

  root.addEventListener("wheel", onWheel, { capture: true, passive: false });

  return () => {
    root.removeEventListener("wheel", onWheel, { capture: true });
  };
}
