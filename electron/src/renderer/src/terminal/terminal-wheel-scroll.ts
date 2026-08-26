import type { Terminal } from "@xterm/xterm";

/** True when the viewport is pinned to the live output (not reading scrollback). */
export function isTerminalViewportAtBottom(terminal: Terminal): boolean {
  const buf = terminal.buffer.active;
  return buf.viewportY >= buf.baseY;
}

function wheelDeltaToLines(terminal: Terminal, event: WheelEvent): number {
  const sensitivity = event.shiftKey
    ? (terminal.options.fastScrollSensitivity ?? 5)
    : (terminal.options.scrollSensitivity ?? 1);
  return Math.round((event.deltaY / 53) * sensitivity);
}

/**
 * Wheel should scroll the xterm viewport only — never forward to the PTY as arrow keys
 * (which surfaces shell/TUI command history instead of scrollback).
 */
export function installTerminalWheelScroll(terminal: Terminal): () => void {
  terminal.attachCustomWheelEventHandler((event) => {
    if (event.deltaY === 0) return true;
    const lines = wheelDeltaToLines(terminal, event);
    if (lines !== 0) {
      terminal.scrollLines(-lines);
    }
    return false;
  });
  return () => terminal.attachCustomWheelEventHandler(() => true);
}
