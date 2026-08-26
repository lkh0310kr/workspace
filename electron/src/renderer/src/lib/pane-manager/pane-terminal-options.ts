import type { ITerminalOptions } from "@xterm/xterm";
import { DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT } from "../shared/terminal-scrollback-policy";

export function buildDefaultTerminalOptions(): ITerminalOptions {
  return {
    allowProposedApi: true,
    cursorBlink: true,
    cursorStyle: "block",
    cursorInactiveStyle: "outline",
    fontSize: 14,
    fontFamily:
      '"SF Mono", "Menlo", "Monaco", "Cascadia Mono", "Consolas", "DejaVu Sans Mono", monospace',
    fontWeight: "300",
    fontWeightBold: "500",
    scrollback: DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT,
    scrollSensitivity: 1.15,
    fastScrollSensitivity: 5,
    smoothScrollDuration: 0,
    allowTransparency: false,
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    drawBoldTextInBrightColors: true,
    scrollbar: { width: 7 },
    vtExtensions: { kittyKeyboard: true },
  };
}
