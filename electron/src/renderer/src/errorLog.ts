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

// React's own internal invariant message when an uncaught error escapes a
// commit-phase callback (e.g. a passive-effect) mid-flight — its
// "isWorking" flag is left stuck true, so every render attempt after this
// immediately re-throws the same invariant. Nothing in application code
// can catch or recover from this once it fires; the renderer is
// permanently wedged (all interaction dead) until reloaded. Confirmed
// root cause here: react-dom's dev-only component-render-diff logging
// (chunk bundling require_react_dom, function names logComponentRender/
// addObjectDiffToProperties — this code doesn't exist in a production
// build) walks rendered props/state to report to an attached React
// DevTools extension, and throws an uncaught SecurityError when a value
// happens to reference a cross-origin frame's Window (a <webview>'s guest
// content, or an EPUB pane's sandboxed iframe). That SecurityError is
// react-dom's own dev-tooling failing, not application code — nothing
// here can prevent the trigger, only recover from it automatically
// instead of leaving the user with a dead UI until they notice and
// manually reload.
const REACT_SCHEDULER_WEDGED_PATTERN = /Should not already be working/;

// Why (2026-08-28): a one-time-ever guard meant a *second* occurrence in
// the same tab session (e.g. opening a second cross-origin webview/engine
// bundle later, with devtools still attached) left the UI permanently
// dead with no auto-recovery — the user had to notice and reload
// manually. This is interaction-triggered, not load-triggered, so each
// occurrence is a separate, unrelated trigger; only a *tight* burst of
// reloads (this pattern firing again within the cooldown, i.e. the reload
// itself didn't fix anything) indicates something is actually wrong
// beyond the known failure mode and should stop looping silently.
const WEDGED_RELOAD_COOLDOWN_MS = 15_000;

/** Catches what React's own error boundaries can't: uncaught exceptions
 * outside any render call stack (CodeMirror's internal measure/layout
 * passes, timers, etc.) and unhandled promise rejections (a failed IPC
 * invoke, like fs:read-file on a missing file). */
export function installGlobalErrorLogging(): () => void {
  const onError = (event: ErrorEvent) => {
    logError(event.message, event.error?.stack);
    // sessionStorage guard: this is interaction-triggered (opening/
    // rendering a cross-origin frame while a devtools extension is
    // attached), not load-triggered, so a genuine reload loop isn't
    // expected — but auto-reloading more than once per session would
    // mean *something* is wrong beyond this known failure mode, and
    // silently looping would hide that instead of surfacing it.
    const loopGuardKey = "workspace.autoReloadedForWedgedScheduler.lastAt";
    if (REACT_SCHEDULER_WEDGED_PATTERN.test(event.message)) {
      const lastAt = Number(sessionStorage.getItem(loopGuardKey) ?? "0");
      const now = Date.now();
      if (now - lastAt >= WEDGED_RELOAD_COOLDOWN_MS) {
        // Session ≠ mount (see docs/architecture/README.md's core
        // principles) — PTY processes and layout JSON live in the main
        // process, so reloading the renderer reconnects to them rather
        // than losing anything, the same way a workspace-tab hide/show
        // already does.
        console.warn("[errorLog] React's scheduler is wedged (dev-mode-only React DevTools interaction) — reloading to recover.");
        sessionStorage.setItem(loopGuardKey, String(now));
        window.location.reload();
      } else {
        console.error(
          "[errorLog] React's scheduler wedged again within the reload cooldown — not auto-reloading (would loop); reload manually.",
        );
      }
    }
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
