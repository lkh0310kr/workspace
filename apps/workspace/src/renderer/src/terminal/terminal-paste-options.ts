import type { TuiAgent } from "../../../shared/agent/tui-agent";
import type { PasteTerminalTextOptions } from "./terminal-bracketed-paste";

export function resolveTerminalMultilinePasteOptions(
  terminalAgent?: TuiAgent | null,
): PasteTerminalTextOptions | undefined {
  const isMac = navigator.userAgent.includes("Mac");
  const isWin = navigator.userAgent.includes("Windows");
  if (isWin || isMac || terminalAgent) {
    return { forceBracketedPasteForMultiline: true };
  }
  return undefined;
}
