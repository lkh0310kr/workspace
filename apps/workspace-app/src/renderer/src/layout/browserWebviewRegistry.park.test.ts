/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

function createWebview(): Electron.WebviewTag {
  return Object.assign(document.createElement("webview"), {
    blur: vi.fn(),
    style: {} as CSSStyleDeclaration,
  }) as Electron.WebviewTag;
}

describe("browser webview park/claim", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("reclaims a parked webview before the destroy timer fires", async () => {
    vi.useFakeTimers();
    const {
      registerPersistentWebview,
      parkBrowserWebview,
      claimParkedBrowserWebview,
      getPersistentBrowserWebview,
    } = await import("./browserWebviewRegistry");

    const webview = createWebview();
    const container = document.createElement("div");
    document.body.appendChild(container);
    registerPersistentWebview("tab-1", webview);
    container.appendChild(webview);

    parkBrowserWebview("tab-1", webview);
    expect(getPersistentBrowserWebview("tab-1")).toBe(webview);

    vi.advanceTimersByTime(200);
    const reclaimed = claimParkedBrowserWebview("tab-1", container);
    expect(reclaimed).toBe(webview);
    expect(webview.parentElement).toBe(container);

    vi.advanceTimersByTime(500);
    expect(getPersistentBrowserWebview("tab-1")).toBe(webview);
  });
});
