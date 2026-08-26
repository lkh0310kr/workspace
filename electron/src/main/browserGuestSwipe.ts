import { webContents, type WebContents } from "electron";
import {
  createSwipeNavState,
  nextSwipeNavAction,
  wheelDeltasFromInput,
  type SwipeNavState,
} from "../shared/browserSwipeNavPolicy";

let focusedGuestId: number | null = null;
const swipeStates = new Map<number, SwipeNavState>();

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

function navigateGuest(guest: WebContents, direction: "back" | "forward"): void {
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

/**
 * `<webview>` guests do not receive renderer wheel listeners (Electron OOPIF).
 * Handle trackpad horizontal swipe via guest WebContents `input-event` instead.
 */
export function installBrowserGuestWebview(contents: WebContents): void {
  const state = createSwipeNavState();
  swipeStates.set(contents.id, state);

  contents.on("input-event", (event, input) => {
    if (input.type !== "mouseWheel") return;
    const wheel = input as Electron.MouseWheelInputEvent;
    const { deltaX, deltaY } = wheelDeltasFromInput(wheel);
    const action = nextSwipeNavAction(state, deltaX, deltaY, {
      canGoBack: () => contents.navigationHistory.canGoBack(),
      canGoForward: () => contents.navigationHistory.canGoForward(),
    });
    if (!action) return;
    event.preventDefault();
    navigateGuest(contents, action);
  });

  contents.once("destroyed", () => {
    swipeStates.delete(contents.id);
    if (focusedGuestId === contents.id) focusedGuestId = null;
  });
}

/** macOS 3-finger swipe + Windows mouse-button back/forward for focused browser guest. */
export function installBrowserGuestSwipeNavigation(window: Electron.BrowserWindow): void {
  if (process.platform === "darwin") {
    window.on("swipe", (_event, direction) => {
      const guest = focusedGuest();
      if (!guest) return;
      if (direction === "left") navigateGuest(guest, "back");
      else if (direction === "right") navigateGuest(guest, "forward");
    });
  }

  if (process.platform === "win32") {
    window.on("app-command", (_event, command) => {
      const guest = focusedGuest();
      if (!guest) return;
      if (command === "browser-backward") navigateGuest(guest, "back");
      else if (command === "browser-forward") navigateGuest(guest, "forward");
    });
  }
}
