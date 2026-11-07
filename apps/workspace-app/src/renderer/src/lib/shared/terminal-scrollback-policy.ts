export const DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT = 5000;
export const TERMINAL_OUTPUT_BACKLOG_MIN_CAP_CHARS = 2 * 1024 * 1024;
const OUTPUT_BACKLOG_CHARS_PER_SCROLLBACK_ROW = 120;

export function normalizeDesktopTerminalScrollbackRows(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT;
  }
  return Math.min(50000, Math.max(1000, Math.floor(value)));
}

export function terminalOutputBacklogCapChars(scrollbackRows: unknown): number {
  const rows = normalizeDesktopTerminalScrollbackRows(scrollbackRows);
  return Math.max(TERMINAL_OUTPUT_BACKLOG_MIN_CAP_CHARS, rows * OUTPUT_BACKLOG_CHARS_PER_SCROLLBACK_ROW);
}
