/** macOS trackpad two-finger horizontal swipe → browser history back/forward (Chrome-like). */

const SWIPE_DELTA_THRESHOLD = 48;
const SWIPE_COOLDOWN_MS = 450;
const ACCUM_RESET_MS = 120;

export type BrowserSwipeNavHandlers = {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
};

/**
 * Wheel events on the `<webview>` host fire before the guest consumes them.
 * Accumulate horizontal delta across trackpad frames, then navigate once per gesture.
 */
export function attachBrowserSwipeNavigation(
  webview: HTMLElement,
  handlers: BrowserSwipeNavHandlers,
  isActive: () => boolean,
): () => void {
  let lastNavAt = 0;
  let accumX = 0;
  let accumResetTimer: ReturnType<typeof setTimeout> | null = null;

  const resetAccum = (): void => {
    accumX = 0;
    if (accumResetTimer !== null) {
      clearTimeout(accumResetTimer);
      accumResetTimer = null;
    }
  };

  const scheduleAccumReset = (): void => {
    if (accumResetTimer !== null) clearTimeout(accumResetTimer);
    accumResetTimer = setTimeout(resetAccum, ACCUM_RESET_MS);
  };

  const onWheel = (e: WheelEvent): void => {
    if (!isActive()) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

    accumX += e.deltaX;
    scheduleAccumReset();

    const now = Date.now();
    if (now - lastNavAt < SWIPE_COOLDOWN_MS) {
      if (Math.abs(accumX) >= SWIPE_DELTA_THRESHOLD) e.preventDefault();
      return;
    }

    // Swipe right (positive deltaX) → back; swipe left → forward — matches Chrome on macOS.
    if (accumX >= SWIPE_DELTA_THRESHOLD && handlers.canGoBack()) {
      e.preventDefault();
      handlers.goBack();
      lastNavAt = now;
      resetAccum();
      return;
    }
    if (accumX <= -SWIPE_DELTA_THRESHOLD && handlers.canGoForward()) {
      e.preventDefault();
      handlers.goForward();
      lastNavAt = now;
      resetAccum();
    }
  };

  webview.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    resetAccum();
    webview.removeEventListener("wheel", onWheel);
  };
}
