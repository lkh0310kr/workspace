import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { appSupportDir } from "./persistence";
import { getBootstrapLogsDir } from "./startupLog";

export type AppLogLevel = "log" | "info" | "warn" | "error" | "debug";

function isElectronAppReady(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    return typeof app?.isPackaged === "boolean";
  } catch {
    return false;
  }
}

/** All NDJSON logs live under `{appSupportDir}/logs/`. */
export function getLogsDir(): string {
  if (process.env.WORKSPACE_TEST_LOG_DIR) {
    return process.env.WORKSPACE_TEST_LOG_DIR;
  }
  if (!isElectronAppReady()) {
    return getBootstrapLogsDir();
  }
  return join(appSupportDir(), "logs");
}

export function getLogFilePath(fileName: string): string {
  return join(getLogsDir(), fileName);
}

export function shouldWriteDebugLogs(): boolean {
  if (process.env.WORKSPACE_DISABLE_FILE_LOGS === "1") return false;
  return true;
}

export function appendNdjsonLog(fileName: string, entry: Record<string, unknown>): void {
  if (!shouldWriteDebugLogs()) return;
  try {
    const dir = getLogsDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, fileName), `${JSON.stringify(entry)}\n`);
  } catch {
    /* ignore logging failures */
  }
}

export function appendAppLog(
  source: string,
  level: AppLogLevel,
  event: string,
  data?: Record<string, unknown>,
): void {
  appendNdjsonLog("app.ndjson", {
    ts: new Date().toISOString(),
    source,
    level,
    event,
    ...(data ?? {}),
  });
}

function serializeConsoleValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();
  if (value === undefined) return null;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return value;
}

export function serializeConsoleArgs(args: unknown[]): unknown[] {
  return args.map(serializeConsoleValue);
}

export function appendConsoleLog(
  processName: "main" | "renderer",
  level: AppLogLevel,
  args: unknown[],
  extra?: Record<string, unknown>,
): void {
  const fileName = processName === "main" ? "main-console.ndjson" : "renderer-console.ndjson";
  appendNdjsonLog(fileName, {
    ts: new Date().toISOString(),
    process: processName,
    level,
    args: serializeConsoleArgs(args),
    ...(extra ?? {}),
  });
}

export function installMainConsoleFileLogging(): void {
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const wrap =
    (level: AppLogLevel, fn: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      fn(...args);
      appendConsoleLog("main", level, args);
    };

  console.log = wrap("log", original.log);
  console.info = wrap("info", original.info);
  console.warn = wrap("warn", original.warn);
  console.error = wrap("error", original.error);
  console.debug = wrap("debug", original.debug);
}
