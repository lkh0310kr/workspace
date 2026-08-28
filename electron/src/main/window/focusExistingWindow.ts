import type { App, BrowserWindow } from "electron";

/** Orca focus-existing-window.ts — win32 needs extra activation nudges. */
export function reinforceExistingWindowFocus(
  window: BrowserWindow,
  app: Pick<App, "focus">,
): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  try {
    app.focus({ steal: true });
  } catch {
    try {
      app.focus();
    } catch {
      /* best effort */
    }
  }
  window.focus();

  if (process.platform !== "win32") return;

  try {
    window.moveTop();
  } catch {
    /* older Electron / destroyed */
  }

  if (!window.isDestroyed() && !window.isAlwaysOnTop()) {
    try {
      window.setAlwaysOnTop(true);
      setTimeout(() => {
        if (!window.isDestroyed()) window.setAlwaysOnTop(false);
      }, 250);
    } catch {
      /* ignore */
    }
  }

  setTimeout(() => {
    if (window.isDestroyed()) return;
    try {
      app.focus({ steal: true });
    } catch {
      try {
        app.focus();
      } catch {
        /* ignore */
      }
    }
    window.focus();
  }, 100);
}
