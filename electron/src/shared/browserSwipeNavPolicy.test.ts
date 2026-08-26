import { describe, expect, it, vi } from "vitest";
import {
  createSwipeNavState,
  nextSwipeNavAction,
  wheelDeltasFromInput,
} from "./browserSwipeNavPolicy";

describe("browserSwipeNavPolicy", () => {
  it("navigates back on accumulated positive deltaX", () => {
    const state = createSwipeNavState();
    const caps = { canGoBack: () => true, canGoForward: () => false };
    expect(nextSwipeNavAction(state, 30, 0, caps, 1000)).toBeNull();
    expect(nextSwipeNavAction(state, 30, 0, caps, 1050)).toBe("back");
  });

  it("navigates forward on accumulated negative deltaX", () => {
    const state = createSwipeNavState();
    const caps = { canGoBack: () => false, canGoForward: () => true };
    expect(nextSwipeNavAction(state, -30, 0, caps, 1000)).toBeNull();
    expect(nextSwipeNavAction(state, -30, 0, caps, 1050)).toBe("forward");
  });

  it("ignores mostly vertical wheel", () => {
    const state = createSwipeNavState();
    const caps = { canGoBack: () => true, canGoForward: () => true };
    expect(nextSwipeNavAction(state, 5, 40, caps, 1000)).toBeNull();
    expect(state.accumX).toBe(0);
  });

  it("respects cooldown between navigations", () => {
    const state = createSwipeNavState();
    const caps = { canGoBack: vi.fn(() => true), canGoForward: () => false };
    expect(nextSwipeNavAction(state, 60, 0, caps, 1000)).toBe("back");
    expect(nextSwipeNavAction(state, 60, 0, caps, 1100)).toBeNull();
  });

  it("maps wheelTicks when deltaX is missing", () => {
    expect(wheelDeltasFromInput({ wheelTicksX: 5, wheelTicksY: 0 })).toEqual({
      deltaX: 50,
      deltaY: 0,
    });
  });
});
