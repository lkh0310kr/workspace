import type { IDisposable, Terminal } from "@xterm/xterm";
import {
  isTerminalLinkifierHoverActive,
  resetTerminalLinkifierHoverState,
} from "./terminal-linkifier-hover-reset";

const HOVER_RESET_THROTTLE_MS = 150;

export function installTerminalLinkifierHoverResetOnWrite(terminal: Terminal): IDisposable {
  if (typeof terminal.onWriteParsed !== "function") {
    return { dispose: () => undefined };
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = (): void => {
    if (isTerminalLinkifierHoverActive(terminal)) {
      timer = setTimeout(flush, HOVER_RESET_THROTTLE_MS);
      return;
    }
    timer = null;
    resetTerminalLinkifierHoverState(terminal);
  };
  const scheduleReset = (): void => {
    if (timer !== null) {
      return;
    }
    timer = setTimeout(flush, HOVER_RESET_THROTTLE_MS);
  };
  const writeParsedDisposable = terminal.onWriteParsed(scheduleReset);
  return {
    dispose: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      writeParsedDisposable.dispose();
    },
  };
}
