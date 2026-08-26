export type SwipeNavAction = "back" | "forward" | null;

export type SwipeNavCaps = {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
};

export type SwipeNavState = {
  accumX: number;
  lastNavAt: number;
  lastWheelAt: number;
};

const SWIPE_DELTA_THRESHOLD = 48;
const SWIPE_COOLDOWN_MS = 450;
const ACCUM_RESET_MS = 150;

export function createSwipeNavState(): SwipeNavState {
  return { accumX: 0, lastNavAt: 0, lastWheelAt: 0 };
}

/**
 * Chrome-like horizontal trackpad swipe → history navigation.
 * Swipe right (positive deltaX) → back; swipe left → forward.
 */
export function nextSwipeNavAction(
  state: SwipeNavState,
  deltaX: number,
  deltaY: number,
  caps: SwipeNavCaps,
  now = Date.now(),
): SwipeNavAction {
  if (Math.abs(deltaX) <= Math.abs(deltaY)) {
    if (now - state.lastWheelAt > ACCUM_RESET_MS) state.accumX = 0;
    return null;
  }

  if (now - state.lastWheelAt > ACCUM_RESET_MS) state.accumX = 0;
  state.lastWheelAt = now;
  state.accumX += deltaX;

  if (now - state.lastNavAt < SWIPE_COOLDOWN_MS) return null;

  if (state.accumX >= SWIPE_DELTA_THRESHOLD && caps.canGoBack()) {
    state.lastNavAt = now;
    state.accumX = 0;
    return "back";
  }
  if (state.accumX <= -SWIPE_DELTA_THRESHOLD && caps.canGoForward()) {
    state.lastNavAt = now;
    state.accumX = 0;
    return "forward";
  }
  return null;
}

export function wheelDeltasFromInput(input: {
  deltaX?: number;
  deltaY?: number;
  wheelTicksX?: number;
  wheelTicksY?: number;
}): { deltaX: number; deltaY: number } {
  const tickScale = 10;
  const deltaX = input.deltaX ?? (input.wheelTicksX ?? 0) * tickScale;
  const deltaY = input.deltaY ?? (input.wheelTicksY ?? 0) * tickScale;
  return { deltaX, deltaY };
}
