/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { isWebviewHostFocused } from "./browserGuestFocus";

describe("browserGuestFocus", () => {
  it("detects when the webview host owns focus", () => {
    const webview = document.createElement("webview") as Electron.WebviewTag;
    document.body.appendChild(webview);
    webview.focus = vi.fn(() => {
      Object.defineProperty(document, "activeElement", {
        configurable: true,
        value: webview,
      });
    });
    webview.focus();
    expect(isWebviewHostFocused(webview)).toBe(true);
  });
});
