import type { BrowserWindow, Rectangle } from "electron";
import { isWsl, readWindowsWorkingArea } from "./wslPaths";

/** WSLg: native maximize()/isMaximized() lie about size vs the RAIL host window. */
const wslMaximizedByTab = new WeakMap<BrowserWindow, boolean>();
const wslRestoredBoundsByTab = new WeakMap<BrowserWindow, Rectangle>();

function defaultRestoredBounds(): Rectangle {
  const wa = readWindowsWorkingArea();
  if (!wa) return { x: 80, y: 80, width: 900, height: 670 };
  const width = Math.max(400, Math.round(wa.width * 0.85));
  const height = Math.max(300, Math.round(wa.height * 0.85));
  return {
    x: wa.x + Math.round((wa.width - width) / 2),
    y: wa.y + Math.round((wa.height - height) / 2),
    width,
    height,
  };
}

/** Apply Windows working-area bounds (DIP) — matches the WSLg RAIL host window. */
export function applyWslWorkAreaBounds(win: BrowserWindow): boolean {
  if (!isWsl() || win.isDestroyed()) return false;
  const wa = readWindowsWorkingArea();
  if (!wa) return false;
  win.setBounds(wa);
  wslMaximizedByTab.set(win, true);
  return true;
}

export function isWslWorkAreaMaximized(win: BrowserWindow): boolean {
  return wslMaximizedByTab.get(win) ?? false;
}

export function toggleWslWindowMaximize(win: BrowserWindow): void {
  if (!isWsl() || win.isDestroyed()) return;
  if (isWslWorkAreaMaximized(win)) {
    const restore = wslRestoredBoundsByTab.get(win) ?? defaultRestoredBounds();
    win.setBounds(restore);
    wslMaximizedByTab.set(win, false);
    return;
  }
  wslRestoredBoundsByTab.set(win, win.getBounds());
  applyWslWorkAreaBounds(win);
}

/** Show then pin bounds — WSLg ignores setBounds before the window is mapped. */
export function revealWslWindow(win: BrowserWindow): void {
  if (!isWsl() || win.isDestroyed()) return;
  win.show();
  const apply = (): void => {
    if (win.isDestroyed()) return;
    applyWslWorkAreaBounds(win);
  };
  apply();
  setImmediate(apply);
}
