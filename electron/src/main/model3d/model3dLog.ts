import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { app } from "electron";
import { appSupportDir } from "../persistence";

function isElectronAppReady(): boolean {
  try {
    return typeof app?.isPackaged === "boolean";
  } catch {
    return false;
  }
}

export function getModel3dLogPath(): string {
  if (process.env.WORKSPACE_MODEL3D_LOG_DIR) {
    return join(process.env.WORKSPACE_MODEL3D_LOG_DIR, "model3d.ndjson");
  }
  if (!isElectronAppReady()) {
    return join(homedir(), ".config", "workspace-app-dev", "logs", "model3d.ndjson");
  }
  return join(appSupportDir(), "logs", "model3d.ndjson");
}

export function model3dLog(event: string, data?: Record<string, unknown>): void {
  const payload = { ts: new Date().toISOString(), event, ...(data ?? {}) };
  const line = `${JSON.stringify(payload)}\n`;
  console.log(`[model3d] ${event}`, data ?? "");
  try {
    const logPath = getModel3dLogPath();
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, line);
  } catch (err) {
    console.warn("[model3d] failed to write log", err);
  }
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
