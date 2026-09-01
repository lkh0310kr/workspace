type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

let installed = false;

function sendConsoleLog(level: ConsoleLevel, args: unknown[]): void {
  try {
    window.api?.debug?.consoleLog?.(level, args);
  } catch {
    /* preload unavailable in tests */
  }
}

export function installRendererConsoleFileLogging(): void {
  if (installed) return;
  installed = true;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const wrap =
    (level: ConsoleLevel, fn: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      fn(...args);
      sendConsoleLog(level, args);
    };

  console.log = wrap("log", original.log);
  console.info = wrap("info", original.info);
  console.warn = wrap("warn", original.warn);
  console.error = wrap("error", original.error);
  console.debug = wrap("debug", original.debug);
}

export function fileLogError(message: string, stack?: string, extra?: Record<string, unknown>): void {
  try {
    window.api?.debug?.errorLog?.(message, stack, extra);
  } catch {
    /* ignore */
  }
}

export function fileLogEvent(source: string, event: string, data?: Record<string, unknown>): void {
  try {
    window.api?.debug?.appLog?.(source, "info", event, data);
  } catch {
    /* ignore */
  }
}
