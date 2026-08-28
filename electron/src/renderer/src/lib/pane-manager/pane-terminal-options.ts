import type { ITerminalOptions } from "@xterm/xterm";
import { DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT } from "../shared/terminal-scrollback-policy";

type TerminalCursorStyle = NonNullable<ITerminalOptions["cursorStyle"]>;
type TerminalCursorInactiveStyle = NonNullable<ITerminalOptions["cursorInactiveStyle"]>;

export const DEFAULT_TERMINAL_SCROLL_SENSITIVITY = 1.15;
export const DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY = 5;

export function normalizeTerminalScrollSensitivity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(10, Math.max(0.1, value))
    : DEFAULT_TERMINAL_SCROLL_SENSITIVITY;
}

export function normalizeTerminalFastScrollSensitivity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(20, Math.max(1, value))
    : DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY;
}

export function resolveTerminalCursorInactiveStyle(
  cursorStyle: TerminalCursorStyle | undefined,
): TerminalCursorInactiveStyle {
  return (cursorStyle ?? "block") === "block" ? "outline" : (cursorStyle ?? "block");
}

export function buildDefaultTerminalOptions(): ITerminalOptions {
  const cursorStyle: TerminalCursorStyle = "block";

  return {
    allowProposedApi: true,
    cursorBlink: true,
    cursorStyle,
    cursorInactiveStyle: resolveTerminalCursorInactiveStyle(cursorStyle),
    fontSize: 14,
    // Hangul-capable fallbacks after the Mac/Windows Western mono fonts —
    // without these, Korean IME preedit/commit renders as missing glyphs
    // on Windows/WSL (DejaVu has no Hangul coverage).
    fontFamily:
      '"SF Mono", "Menlo", "Monaco", "Cascadia Mono", "Consolas", "D2Coding", "NanumGothicCoding", "Noto Sans Mono CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", "DejaVu Sans Mono", "Liberation Mono", monospace',
    fontWeight: "300",
    fontWeightBold: "500",
    scrollback: DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT,
    scrollSensitivity: DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
    fastScrollSensitivity: DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY,
    allowTransparency: false,
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    drawBoldTextInBrightColors: true,
    scrollbar: { width: 7 },
    vtExtensions: { kittyKeyboard: true },
  };
}
