import { readFileSync } from "node:fs";
import { appendAppLog, appendNdjsonLog, getLogFilePath } from "../debugLogSink";

export function getModel3dLogPath(): string {
  return getLogFilePath("model3d.ndjson");
}

export function model3dLog(event: string, data?: Record<string, unknown>): void {
  const payload = { ts: new Date().toISOString(), event, ...(data ?? {}) };
  console.log(`[model3d] ${event}`, data ?? "");
  appendNdjsonLog("model3d.ndjson", payload);
  appendAppLog("model3d", "info", event, data);
}

export function readModel3dLogs(limit = 200): Record<string, unknown>[] {
  try {
    const text = readFileSync(getModel3dLogPath(), "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return { ts: null, event: "parse_error", raw: line };
      }
    });
  } catch {
    return [];
  }
}
