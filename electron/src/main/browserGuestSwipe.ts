import { webContents, type WebContents } from "electron";

let focusedGuestId: number | null = null;

export function setFocusedBrowserGuestId(id: number | null): void {
  focusedGuestId = id;
}

function focusedGuest(): WebContents | null {
  if (focusedGuestId === null) return null;
  const wc = webContents.fromId(focusedGuestId);
  if (!wc || wc.isDestroyed()) {
    focusedGuestId = null;
    return null;
  }
  return wc;
}

function navigateGuest(direction: "back" | "forward"): void {
  const guest = focusedGuest();
  if (!guest) return;
  try {
    if (direction === "back" && guest.navigationHistory.canGoBack()) {
      guest.navigationHistory.goBack();
    } else if (direction === "forward" && guest.navigationHistory.canGoForward()) {
      guest.navigationHistory.goForward();
    }
  } catch {
    // guest may be mid-teardown
  }
}

/** macOS 3-finger swipe + Windows mouse-button back/forward for focused browser guest. */
export function installBrowserGuestSwipeNavigation(window: Electron.BrowserWindow): void {
  if (process.platform === "darwin") {
    window.on("swipe", (_event, direction) => {
      if (direction === "left") navigateGuest("back");
      else if (direction === "right") navigateGuest("forward");
    });
  }

  if (process.platform === "win32") {
    window.on("app-command", (_event, command) => {
      if (command === "browser-backward") navigateGuest("back");
      else if (command === "browser-forward") navigateGuest("forward");
    });
  }
}
