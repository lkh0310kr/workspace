import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * True when running a packaged asar build.
 * `app.isPackaged` is false when electron-builder sets `executableName: electron`
 * (same basename as the dev Electron binary), so also check for resources/app.asar.
 */
export function isPackagedApp(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    if (app?.isPackaged) {
      return true;
    }
  } catch {
    /* electron not ready */
  }
  const resourcesPath = process.resourcesPath;
  if (typeof resourcesPath === "string") {
    return existsSync(join(resourcesPath, "app.asar"));
  }
  return false;
}

/** @deprecated Use {@link isPackagedApp}. */
export function isPackagedProcess(): boolean {
  return isPackagedApp();
}

/** App support dir without importing Electron `app` (safe before app.ready). */
export function getBootstrapAppSupportDir(): string {
  const suffix = isPackagedProcess() ? "" : "-dev";
  const name = `workspace-app${suffix}`;
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, name);
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", name);
  }
  return join(homedir(), ".config", name);
}

/** Log directory used from the first line of main — including pre-ready failures. */
export function getBootstrapLogsDir(): string {
  if (process.env.WORKSPACE_TEST_LOG_DIR) {
    return process.env.WORKSPACE_TEST_LOG_DIR;
  }
  return join(getBootstrapAppSupportDir(), "logs");
}

export function appendStartupLog(event: string, data?: Record<string, unknown>): void {
  if (process.env.WORKSPACE_DISABLE_FILE_LOGS === "1") return;
  try {
    const dir = getBootstrapLogsDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "startup.ndjson"),
      `${JSON.stringify({
        ts: new Date().toISOString(),
        pid: process.pid,
        ppid: process.ppid,
        event,
        platform: process.platform,
        packaged: isPackagedApp(),
        execPath: process.execPath,
        ...(data ?? {}),
      })}\n`,
    );
  } catch {
    /* ignore logging failures */
  }
}

export function installMainStartupLogging(): void {
  appendStartupLog("main_bootstrap", {
    argv: process.argv,
    cwd: process.cwd(),
    versions: process.versions,
  });

  process.on("uncaughtException", (error) => {
    appendStartupLog("uncaught_exception", {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    });
  });

  process.on("unhandledRejection", (reason) => {
    appendStartupLog("unhandled_rejection", {
      reason:
        reason instanceof Error
          ? { name: reason.name, message: reason.message, stack: reason.stack ?? null }
          : String(reason),
    });
  });
}
