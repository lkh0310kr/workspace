import { appendNdjsonLog, getLogFilePath } from "./debugLogSink";

export function getTerminalLogPath(): string {
  return getLogFilePath("terminal.ndjson");
}

export function appendTerminalLog(entry: Record<string, unknown>): void {
  appendNdjsonLog("terminal.ndjson", entry);
}

export function reprTerminalBytesMain(data: string | Buffer): string {
  const text = typeof data === "string" ? data : data.toString("utf8");
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x1b) {
      out += "\\x1b";
      continue;
    }
    if (code === 0x7f) {
      out += "\\x7f";
      continue;
    }
    if (code < 0x20) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
      continue;
    }
    if (code >= 0x80) {
      out += text[i];
      continue;
    }
    out += text[i];
  }
  return out;
}
