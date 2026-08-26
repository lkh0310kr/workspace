import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export function shouldWriteRendererDebugLogs(): boolean {
  return !app.isPackaged;
}

export function appendNdjsonLog(fileName: string, entry: Record<string, unknown>): void {
  if (!shouldWriteRendererDebugLogs()) return;
  try {
    const dir = join(app.getPath("userData"), "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, fileName), `${JSON.stringify(entry)}\n`);
  } catch {
    /* ignore logging failures */
  }
}
