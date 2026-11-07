import type { Terminal } from "@xterm/xterm";

/** True when the viewport is pinned to the live output (not reading scrollback). */
export function isTerminalViewportAtBottom(terminal: Terminal): boolean {
  const buf = terminal.buffer.active;
  return buf.viewportY >= buf.baseY;
}
