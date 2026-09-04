import type { BrowserWindow, Rectangle } from "electron";
import { isWsl, readWindowsWorkingArea } from "./wslPaths";

/** WSLg: native maximize()/isMaximized() lie about size vs the RAIL host window. */
const wslMaximizedByTab = new WeakMap<BrowserWindow, boolean>();
const wslRestoredBoundsByTab = new WeakMap<BrowserWindow, Rectangle>();
const wslLifecycleInstalled = new WeakSet<BrowserWindow>();

function boundsMatchWorkArea(bounds: Rectangle, wa: Rectangle): boolean {
  return (
    bounds.x === wa.x &&
    bounds.y === wa.y &&
    bounds.width === wa.width &&
    bounds.height === wa.height
  );
}

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

/** Re-pin work-area bounds when WSLg drifts after show/restore/focus. */
export function pinWslWorkAreaIfMaximized(win: BrowserWindow): void {
  if (!isWsl() || win.isDestroyed() || !isWslWorkAreaMaximized(win)) return;
  const wa = readWindowsWorkingArea();
  if (!wa) return;
  const bounds = win.getBounds();
  if (!boundsMatchWorkArea(bounds, wa)) win.setBounds(wa);
}

function scheduleWslWorkAreaPins(win: BrowserWindow): void {
  const pin = (): void => pinWslWorkAreaIfMaximized(win);
  pin();
  setImmediate(pin);
  setTimeout(pin, 50);
  setTimeout(pin, 200);
}

/** Show then pin bounds — WSLg ignores setBounds before the window is mapped. */
export function revealWslWindow(win: BrowserWindow): void {
  if (!isWsl() || win.isDestroyed()) return;
  win.show();
  if (win.isDestroyed()) return;
  applyWslWorkAreaBounds(win);
  scheduleWslWorkAreaPins(win);
}

/** Keep WSLg RAIL host aligned after restore, second-instance focus, etc. */
export function installWslWindowLifecycle(win: BrowserWindow): void {
  if (!isWsl() || wslLifecycleInstalled.has(win)) return;
  wslLifecycleInstalled.add(win);
  const onShow = (): void => scheduleWslWorkAreaPins(win);
  win.on("show", onShow);
  win.on("restore", onShow);
}
