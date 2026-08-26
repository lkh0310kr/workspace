import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

function layoutLogPath(): string {
  return join(app.getPath("userData"), "logs", "layout.ndjson");
}

export function appendLayoutLog(entry: Record<string, unknown>): void {
  try {
    const path = layoutLogPath();
    mkdirSync(join(app.getPath("userData"), "logs"), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
  } catch {
    /* ignore logging failures */
  }
}
