import type { Terminal } from "@xterm/xterm";

/** True when the viewport is pinned to the live output (not reading scrollback). */
export function isTerminalViewportAtBottom(terminal: Terminal): boolean {
  const buf = terminal.buffer.active;
  return buf.viewportY >= buf.baseY;
}

/** Line-based wheel delta (one notch ≈ one row). */
export function wheelDeltaToLines(terminal: Terminal, event: WheelEvent): number {
  const sensitivity = event.shiftKey
    ? (terminal.options.fastScrollSensitivity ?? 5)
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
 * Scroll xterm viewport by whole lines. Always consumes wheel — never forward
 * to the PTY (which surfaces shell history as fake scrollback).
 */
export function applyTerminalWheelScroll(terminal: Terminal, event: WheelEvent): void {
  if (event.deltaY === 0) return;
  const lines = wheelDeltaToLines(terminal, event);
  if (lines !== 0) {
    terminal.scrollLines(-lines);
  }
}

export function installTerminalWheelScroll(terminal: Terminal): () => void {
  const root = terminal.element;
  if (!root) return () => {};

  const onWheel = (event: WheelEvent) => {
    applyTerminalWheelScroll(terminal, event);
    event.preventDefault();
    event.stopPropagation();
  };

  root.addEventListener("wheel", onWheel, { capture: true, passive: false });

  return () => {
    root.removeEventListener("wheel", onWheel, { capture: true });
  };
}
