import { describe, expect, it, vi } from "vitest";
import { attachBrowserSwipeNavigation } from "./browserSwipeNavigation";

function dispatchWheel(target: HTMLElement, deltaX: number): void {
  target.dispatchEvent(
    new WheelEvent("wheel", { deltaX, deltaY: 0, bubbles: true, cancelable: true }),
  );
}

describe("attachBrowserSwipeNavigation", () => {
  it("navigates back on horizontal swipe right (positive deltaX)", () => {
    const el = document.createElement("div");
    const goBack = vi.fn();
    const goForward = vi.fn();
    const detach = attachBrowserSwipeNavigation(
      el,
      {
        canGoBack: () => true,
        canGoForward: () => false,
        goBack,
        goForward,
      },
      () => true,
    );

    dispatchWheel(el, 60);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(goForward).not.toHaveBeenCalled();
    detach();
  });

  it("navigates forward on horizontal swipe left (negative deltaX)", () => {
    const el = document.createElement("div");
    const goBack = vi.fn();
    const goForward = vi.fn();
    const detach = attachBrowserSwipeNavigation(
      el,
      {
        canGoBack: () => false,
        canGoForward: () => true,
        goBack,
        goForward,
      },
      () => true,
    );

    dispatchWheel(el, -60);
    expect(goForward).toHaveBeenCalledTimes(1);
    expect(goBack).not.toHaveBeenCalled();
    detach();
  });

  it("ignores wheel when pane is inactive", () => {
    const el = document.createElement("div");
    const goBack = vi.fn();
    attachBrowserSwipeNavigation(
      el,
      { canGoBack: () => true, canGoForward: () => false, goBack, goForward: vi.fn() },
      () => false,
    );
    dispatchWheel(el, 60);
    expect(goBack).not.toHaveBeenCalled();
  });
});
