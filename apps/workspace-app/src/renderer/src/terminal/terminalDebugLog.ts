/**
 * Terminal keyboard / PTY / xterm I/O debug logging — NDJSON file (main process) + ring buffer.
 */

const MAX_RING = 500;

export type TerminalLogEntry = {
  sessionId: string;
  timestamp: number;
  location: string;
  message: string;
  terminalId?: number;
  data?: Record<string, unknown>;
};

const ring: TerminalLogEntry[] = [];

export function reprTerminalBytes(data: string): string {
  let out = "";
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    if (code === 0x1b) {
      out += "\\x1b";
      continue;
    }
    if (code === 0x7f) {
      out += "\\x7f";
      continue;
    }
    if (code < 0x20 || code === 0x7f) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
      continue;
    }
    if (code >= 0x80) {
      out += data[i];
      continue;
    }
    out += data[i];
  }
  return out;
}

export function serializeKeyboardEvent(event: Pick<
  KeyboardEvent,
  | "type"
  | "key"
  | "code"
  | "keyCode"
  | "metaKey"
  | "ctrlKey"
  | "altKey"
  | "shiftKey"
  | "repeat"
  | "isComposing"
  | "defaultPrevented"
  | "location"
>): Record<string, unknown> {
  return {
    type: event.type,
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    isComposing: event.isComposing,
    defaultPrevented: event.defaultPrevented,
    location: event.location,
  };
}

export function termLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
  terminalId?: number,
): void {
  const entry: TerminalLogEntry = {
    sessionId: "terminal",
    timestamp: Date.now(),
    location,
    message,
    terminalId,
    data,
  };
  ring.push(entry);
  if (ring.length > MAX_RING) ring.shift();
  try {
    window.api?.debug?.terminalLog(entry as Record<string, unknown>);
  } catch {
    /* ignore */
  }
}

export function getTerminalLogRing(): readonly TerminalLogEntry[] {
  return ring;
}
