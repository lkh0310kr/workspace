import type { ITheme } from "@xterm/xterm";
import type { ResolvedTheme } from "./theme";

// Port of ref-proj/orca/src/renderer/src/lib/terminal-themes/defaults.ts —
// Ghostty Default Style Dark + Builtin Tango Light. Orca raises dark selection
// contrast because Ghostty's original #3e4451 blends into Codex-style gray blocks.
export const XTERM_THEMES: Record<ResolvedTheme, ITheme> = {
  dark: {
    background: "#313338",
    foreground: "#f2f3f5",
    cursor: "#f2f3f5",
    cursorAccent: "#313338",
    selectionBackground: "#4752c4",
    selectionForeground: "#ffffff",
    black: "#1e1f22",
    red: "#cc6666",
    green: "#b5bd68",
    yellow: "#f0c674",
    blue: "#5865f2",
    magenta: "#b586d9",
    cyan: "#8abeb7",
    white: "#dbdee1",
    brightBlack: "#666666",
    brightRed: "#d54e53",
    brightGreen: "#b9ca4a",
    brightYellow: "#e7c547",
    brightBlue: "#7aa6da",
    brightMagenta: "#c397d8",
    brightCyan: "#70c0b1",
    brightWhite: "#f2f5fa",
  },
  light: {
    background: "#f2f3f5",
    foreground: "#232428",
    cursor: "#232428",
    cursorAccent: "#f2f3f5",
    selectionBackground: "#c7cbff",
    selectionForeground: "#232428",
    black: "#232428",
    red: "#cc0000",
    green: "#4e9a06",
    yellow: "#8e7700",
    blue: "#3465a4",
    magenta: "#75507b",
    cyan: "#05727e",
    white: "#6a6a6a",
    brightBlack: "#555753",
    brightRed: "#ef2929",
    brightGreen: "#1b7a1b",
    brightYellow: "#6d5a00",
    brightBlue: "#204a87",
    brightMagenta: "#ad7fa8",
    brightCyan: "#034b50",
    brightWhite: "#3d3d3d",
  },
};

export const TERMINAL_SCROLLBACK_ROWS = 5000;

export function getTerminalSearchDecorations(theme: ResolvedTheme) {
  if (theme === "light") {
    return {
      matchBackground: "#ffe08a",
      matchBorder: "#e6c200",
      matchOverviewRuler: "#ffcc00",
      activeMatchBackground: "#ff9900",
      activeMatchBorder: "#cc7a00",
      activeMatchColorOverviewRuler: "#ff9900",
    };
  }
  return {
    matchBackground: "#5c4a00",
    matchBorder: "#5c4a00",
    matchOverviewRuler: "#ffcc00",
    activeMatchBackground: "#c4580e",
    activeMatchBorder: "#ffcf6b",
    activeMatchColorOverviewRuler: "#ff9900",
  };
}
