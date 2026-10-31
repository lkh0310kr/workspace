/**
 * A full app restart replaces the process that owned a serialized terminal.
 * End any stale TUI screen and input modes before the fresh shell starts so
 * mouse-wheel input returns to xterm scrollback instead of the dead TUI.
 */
export const COLD_RESTORE_TERMINAL_RESET =
  "\x1b[?1049l\x1b[0m\x1b[0 q\x1b[?25h" +
  "\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l" +
  "\x1b[?1006l\x1b[?1015l\x1b[?1016l\x1b[?1004l\x1b[?2004l";

export function prepareTerminalColdRestoreSnapshot(snapshot: string): string {
  return snapshot ? `${snapshot}${COLD_RESTORE_TERMINAL_RESET}` : snapshot;
}
