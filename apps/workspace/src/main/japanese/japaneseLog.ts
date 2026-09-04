import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { getJapaneseLogPath } from "./paths";

export function japaneseLog(event: string, data?: Record<string, unknown>): void {
  const payload = { ts: new Date().toISOString(), event, ...(data ?? {}) };
  const line = `${JSON.stringify(payload)}\n`;
  console.log(`[japanese] ${event}`, data ?? "");
  try {
    const logPath = getJapaneseLogPath();
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, line);
  } catch (err) {
    console.warn("[japanese] failed to write log", err);
  }
}

export function readJapaneseLogs(limit = 80): Record<string, unknown>[] {
  try {
    const logPath = getJapaneseLogPath();
    const text = readFileSync(logPath, "utf8");
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
