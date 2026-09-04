import type { ITerminalOptions } from "@xterm/xterm";
import type { TuiAgent } from "../../../../shared/agent/tui-agent";
import type { WindowsPtyCompatibilityContext } from "./windows-pty-compatibility";

export type TerminalKeyboardProtocolContext = WindowsPtyCompatibilityContext & {
  tuiAgent?: TuiAgent | null;
};

/** Grok needs KKP for modified Enter on ConPTY — see Orca #2434 exception. */
export function prefersKittyKeyboardDespiteWindowsConpty(
  agent: TuiAgent | null | undefined,
): boolean {
  return agent === "grok";
}

/**
 * Withhold Kitty CSI-u on Windows stable builds. Workspace has no remote SSH
 * panes — every local terminal goes through ConPTY (PowerShell, wsl.exe, …)
 * and enhanced key reporting breaks basic input (Orca #2434).
 */
export function shouldDisableKittyKeyboardForTerminal(
  context: TerminalKeyboardProtocolContext,
): boolean {
  if (prefersKittyKeyboardDespiteWindowsConpty(context.tuiAgent)) {
    return false;
  }
  const ua = context.userAgent ?? "";
  return ua.includes("Windows");
}

export function buildTerminalKeyboardProtocolOptions(
  context: TerminalKeyboardProtocolContext,
): Partial<ITerminalOptions> {
  if (!shouldDisableKittyKeyboardForTerminal(context)) {
    return {};
  }
  return { vtExtensions: { kittyKeyboard: false } };
}
