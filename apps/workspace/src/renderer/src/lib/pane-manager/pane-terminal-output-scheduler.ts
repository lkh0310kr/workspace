import { flattenRetainedSlice } from "../shared/flatten-retained-slice";
import { terminalOutputBacklogCapChars } from "../shared/terminal-scrollback-policy";
import {
  discardForegroundRenderSettle,
  writeForegroundTerminalChunk,
  type ForegroundTerminalOutputTarget,
} from "./pane-terminal-foreground-render-settle";
import { runGuardedWriteCompletionStep } from "./xterm-write-callback-guard";
import { reprTerminalBytes, termLog } from "../../terminal/terminalDebugLog";

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

  termLog("xterm:write", "schedule", {
    bytes: reprTerminalBytes(data),
    length: data.length,
    foreground: options.foreground ?? true,
  });

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
    // Why (2026-08-28): draining exactly one chunk per animation frame meant
    // a burst of many small PTY writes (a fast-redrawing TUI like Claude
    // Code's CLI) took one frame *per chunk* to reach the live state — the
    // terminal stayed visibly seconds behind, and any scroll/interaction
    // issued mid-catch-up looked "queued" behind the stale backlog. Coalesce
    // everything queued right now into one write so a burst lands in one
    // frame instead of trickling in chunk by chunk (Orca's own scheduler
    // does this via its `coalesceForeground` path — same idea, applied here
    // unconditionally since this scheduler has no per-write priority tiers).
    const chunk = entry.chunks.length === 1 ? entry.chunks[0] : entry.chunks.join("");
    const pendingAcks = entry.ackCredits;
    const ack =
      pendingAcks.length > 0
        ? () => {
            for (const credit of pendingAcks) credit();
          }
        : undefined;
    entry.chunks = [];
    entry.ackCredits = [];
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
    queues.delete(terminal);
  }
}

export function clearTerminalOutputQueue(terminal: TerminalOutputTarget): void {
  const entry = queues.get(terminal);
  if (!entry) return;
  for (const credit of entry.ackCredits) credit();
  queues.delete(terminal);
  discardForegroundRenderSettle(terminal);
}
