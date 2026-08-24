// Shared error log — feeds a small on-screen panel (App.tsx's
// ErrorLogPanel) so a crash is visible without opening devtools. Without
// this, flexlayout's own per-tab error boundary was swallowing render
// errors behind a generic "Error rendering component" message with no way
// to see the real one short of digging through the console — exactly what
// made the PaneTabStrip currentTarget-null crash hard to diagnose.
export interface LoggedError {
  id: number;
  message: string;
  stack?: string;
  timestamp: number;
}

let nextId = 1;
let entries: LoggedError[] = [];
const listeners = new Set<(entries: LoggedError[]) => void>();

function notify(): void {
  for (const listener of listeners) listener(entries);
}

export function logError(message: string, stack?: string): void {
  entries = [...entries, { id: nextId++, message, stack, timestamp: Date.now() }].slice(-50);
  console.error("[errorLog]", message, stack ?? "");
  notify();
}

export function dismissError(id: number): void {
  entries = entries.filter((e) => e.id !== id);
  notify();
}

export function clearErrors(): void {
  entries = [];
  notify();
}

export function getErrorLog(): LoggedError[] {
  return entries;
}

export function subscribeErrorLog(listener: (entries: LoggedError[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Catches what React's own error boundaries can't: uncaught exceptions
 * outside any render call stack (CodeMirror's internal measure/layout
 * passes, timers, etc.) and unhandled promise rejections (a failed IPC
 * invoke, like fs:read-file on a missing file). */
export function installGlobalErrorLogging(): () => void {
  const onError = (event: ErrorEvent) => {
    logError(event.message, event.error?.stack);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logError(message, stack);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
