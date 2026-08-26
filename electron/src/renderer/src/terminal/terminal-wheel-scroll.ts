import type { Terminal } from "@xterm/xterm";

/** True when the viewport is pinned to the live output (not reading scrollback). */
export function isTerminalViewportAtBottom(terminal: Terminal): boolean {
  const buf = terminal.buffer.active;
  return buf.viewportY >= buf.baseY;
}

/** tmux / fullscreen TUIs run in the alternate buffer — wheel must reach the PTY. */
export function shouldForwardWheelToPty(terminal: Terminal): boolean {
  return terminal.buffer.active.type === "alternate";
}

function wheelDeltaToLines(terminal: Terminal, event: WheelEvent): number {
  const sensitivity = event.shiftKey
    ? (terminal.options.fastScrollSensitivity ?? 5)
    : (terminal.options.scrollSensitivity ?? 1);
  return Math.round((event.deltaY / 53) * sensitivity);
}

/**
 * Wheel scroll policy:
 * - Alternate buffer (tmux, vim, etc.): forward to PTY — tmux copy-mode scroll needs `mouse on`.
 * - Normal buffer: scroll xterm viewport only — never forward as shell arrow-key history.
 */
export function handleTerminalWheelEvent(terminal: Terminal, event: WheelEvent): boolean {
  if (event.deltaY === 0) return true;
  if (shouldForwardWheelToPty(terminal)) return true;
  const lines = wheelDeltaToLines(terminal, event);
  if (lines !== 0) {
    terminal.scrollLines(-lines);
  }
  return false;
}

export function installTerminalWheelScroll(terminal: Terminal): () => void {
  terminal.attachCustomWheelEventHandler((event) => handleTerminalWheelEvent(terminal, event));
  return () => terminal.attachCustomWheelEventHandler(() => true);
}
