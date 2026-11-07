import { describe, expect, it, vi } from "vitest";
import { loadBrowserPageWebviewUrl, reloadBrowserPageWebview } from "./browserPageWebviewActions";

function createWebview(overrides: Partial<Electron.WebviewTag> = {}): Electron.WebviewTag {
  return {
    getWebContentsId: vi.fn(() => 42),
    reload: vi.fn(),
    reloadIgnoringCache: vi.fn(),
    loadURL: vi.fn(async () => {}),
    ...overrides,
  } as unknown as Electron.WebviewTag;
}

describe("reloadBrowserPageWebview", () => {
  it("reloads a live guest", () => {
    const webview = createWebview();
    expect(reloadBrowserPageWebview(webview, { ignoreCache: false })).toBe("ok");
    expect(webview.reload).toHaveBeenCalledTimes(1);
  });

  it("reports not-ready when reload throws on a live guest", () => {
    const webview = createWebview({
      reload: vi.fn(() => {
        throw new Error("The WebView must be attached to the DOM");
      }),
    });
    expect(reloadBrowserPageWebview(webview, { ignoreCache: false })).toBe("not-ready");
  });
});

describe("loadBrowserPageWebviewUrl", () => {
  it("loads a URL on a live guest", () => {
    const webview = createWebview();
    expect(loadBrowserPageWebviewUrl(webview, "https://example.com")).toBe("ok");
    expect(webview.loadURL).toHaveBeenCalledWith("https://example.com");
  });

  it("reports not-ready when loadURL throws on a live guest", () => {
    const webview = createWebview({
      loadURL: vi.fn(() => {
        throw new Error("The WebView must be attached to the DOM");
      }),
    });
    expect(loadBrowserPageWebviewUrl(webview, "https://example.com")).toBe("not-ready");
  });
});
