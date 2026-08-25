import { flattenRetainedSlice } from "../shared/flatten-retained-slice";
import { terminalOutputBacklogCapChars } from "../shared/terminal-scrollback-policy";
import {
  discardForegroundRenderSettle,
  writeForegroundTerminalChunk,
  type ForegroundTerminalOutputTarget,
} from "./pane-terminal-foreground-render-settle";
import { runGuardedWriteCompletionStep } from "./xterm-write-callback-guard";

type TerminalOutputTarget = ForegroundTerminalOutputTarget;

type QueueEntry = {
  terminal: TerminalOutputTarget;
  chunks: string[];
  foreground: boolean;
  ackCredits: (() => void)[];
};

const queues = new Map<TerminalOutputTarget, QueueEntry>();
let backlogCapChars = terminalOutputBacklogCapChars(5000);
let draining = false;

export function configureTerminalOutputBacklogCap(scrollbackRows: unknown): void {
  backlogCapChars = terminalOutputBacklogCapChars(scrollbackRows);
}

export function writeTerminalOutput(
  terminal: TerminalOutputTarget,
  data: string,
  options: { foreground?: boolean; ackCredit?: () => void } = {},
): void {
  if (!data) {
    options.ackCredit?.();
    return;
  }

  const foreground = options.foreground ?? true;
  const entry = queues.get(terminal) ?? {
    terminal,
    chunks: [],
    foreground,
    ackCredits: [],
  };

  entry.chunks.push(flattenRetainedSlice(data));
  if (options.ackCredit) entry.ackCredits.push(options.ackCredit);

  let retained = entry.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  while (retained > backlogCapChars && entry.chunks.length > 1) {
    const removed = entry.chunks.shift()!;
    retained -= removed.length;
    const credit = entry.ackCredits.shift();
    credit?.();
  }

  entry.foreground = foreground;
  queues.set(terminal, entry);
  scheduleDrain();
}

function scheduleDrain(): void {
  if (draining) return;
  draining = true;
  requestAnimationFrame(() => {
    draining = false;
    drainQueues();
  });
}

function drainQueues(): void {
  for (const [terminal, entry] of queues) {
    if (entry.chunks.length === 0) continue;
    const chunk = entry.chunks.shift()!;
    const ack = entry.ackCredits.shift();
    const write = () => {
      if (entry.foreground) {
        writeForegroundTerminalChunk(terminal, chunk, {
          onParsed: () => ack?.(),
          onWriteFailure: () => ack?.(),
        });
      } else {
        runGuardedWriteCompletionStep("background-write", () => {
          terminal.write(chunk, () => {
            runGuardedWriteCompletionStep("background-write-callback", () => ack?.());
          });
        });
      }
    };
    write();
    if (entry.chunks.length === 0) {
      queues.delete(terminal);
    } else {
      scheduleDrain();
    }
  }
}

export function clearTerminalOutputQueue(terminal: TerminalOutputTarget): void {
  const entry = queues.get(terminal);
  if (!entry) return;
  for (const credit of entry.ackCredits) credit();
  queues.delete(terminal);
  discardForegroundRenderSettle(terminal);
}
