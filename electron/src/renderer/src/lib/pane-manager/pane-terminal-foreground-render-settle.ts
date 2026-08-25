import type { Terminal } from "@xterm/xterm";
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
        if (typeof terminal.rows === "number" && terminal.rows > 0) {
          terminal.refresh(0, terminal.rows - 1);
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
