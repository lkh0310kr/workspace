import type { ITerminalOptions } from "@xterm/xterm";
import type { TuiAgent } from "../../../../shared/agent/tui-agent";
import { isWslUncPath } from "./wsl-unc-path";
import { buildDefaultTerminalOptions } from "./pane-terminal-options";
import { buildWindowsPtyCompatibilityOptions } from "./windows-pty-compatibility";
import { buildTerminalKeyboardProtocolOptions } from "./terminal-keyboard-protocol";

export type TerminalPaneOptionsContext = {
  rootPath?: string | null;
  terminalAgent?: TuiAgent | null;
  zoom?: number;
  userAgent?: string;
  osRelease?: string;
};

/** Merge default xterm options with Windows ConPTY + keyboard-protocol overrides. */
export function buildTerminalPaneOptions(
  context: TerminalPaneOptionsContext,
): ITerminalOptions {
  const cwd = context.rootPath ?? null;
  const compatContext = {
    userAgent: context.userAgent ?? navigator.userAgent,
    osRelease: context.osRelease,
    cwd,
    shellIsWsl: cwd ? isWslUncPath(cwd) : false,
  };

  const themeAndFont = context.zoom
    ? { fontSize: Math.round(14 * context.zoom) }
    : {};

  return {
    ...buildDefaultTerminalOptions(),
    ...buildWindowsPtyCompatibilityOptions(compatContext),
    ...buildTerminalKeyboardProtocolOptions({
      ...compatContext,
      tuiAgent: context.terminalAgent,
    }),
    ...themeAndFont,
  };
}
