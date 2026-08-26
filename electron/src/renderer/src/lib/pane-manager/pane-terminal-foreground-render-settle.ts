import type { Terminal } from "@xterm/xterm";
import { isTerminalViewportAtBottom } from "../../terminal/terminal-wheel-scroll";
import { runGuardedWriteCompletionStep } from "./xterm-write-callback-guard";

export type ForegroundTerminalOutputTarget = Terminal;

type ForegroundTerminalWriteOptions = {
  onParsed?: () => void;
  onWriteFailure?: () => void;
};

export function writeForegroundTerminalChunk(
  terminal: ForegroundTerminalOutputTarget,
  data: string,
  options?: ForegroundTerminalWriteOptions,
): void {
  try {
    terminal.write(data, () => {
      runGuardedWriteCompletionStep("foreground-write-callback", () => {
        options?.onParsed?.();
        const rows = terminal.rows;
        if (rows > 0 && isTerminalViewportAtBottom(terminal)) {
          terminal.refresh(0, rows - 1);
        }
      });
    });
  } catch {
    options?.onWriteFailure?.();
  }
}

export function discardForegroundRenderSettle(_terminal: ForegroundTerminalOutputTarget): void {
  // No-op in simplified pipeline.
}
