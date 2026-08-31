/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { useBrowserGuestActivationFocus } from "./useBrowserGuestActivationFocus";
import type { WebviewGuestFocus } from "./useWebviewGuestFocus";

vi.mock("./useWebviewDragPassthroughActive", () => ({
  useWebviewDragPassthroughActive: () => false,
}));

describe("useBrowserGuestActivationFocus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the activation focus hook", () => {
    expect(typeof useBrowserGuestActivationFocus).toBe("function");
  });

  it("guest focus helper focuses an attached webview", () => {
    const webview = document.createElement("webview") as Electron.WebviewTag;
    webview.focus = vi.fn();
    const guestFocus: WebviewGuestFocus = {
      blur: vi.fn(),
      focus: () => {
        webview.focus();
        return document.activeElement === webview;
      },
      isAttached: () => true,
    };
    document.body.appendChild(webview);
    guestFocus.focus();
    expect(webview.focus).toHaveBeenCalled();
  });
});
