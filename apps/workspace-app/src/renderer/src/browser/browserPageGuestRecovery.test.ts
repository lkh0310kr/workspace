/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureBrowserPageViewport,
  registerBrowserOverlaySlotViewport,
  resetBrowserPageViewportsForTests,
} from "./browserPageViewport";
import {
  destroyBrowserWebview,
  registerPersistentWebview,
} from "../layout/browserWebviewRegistry";
import {
  browserPageGuestNeedsAttach,
  resolveBrowserPageWebview,
} from "./browserPageGuestRecovery";

function createWebview(): Electron.WebviewTag {
  return Object.assign(document.createElement("webview"), {
    getWebContentsId: vi.fn(() => 7),
    style: {} as CSSStyleDeclaration,
  }) as Electron.WebviewTag;
}

describe("browserPageGuestRecovery", () => {
  afterEach(() => {
    destroyBrowserWebview("page-1");
    document.body.innerHTML = "";
    resetBrowserPageViewportsForTests();
  });

  it("detects a registry guest that drifted out of its page container", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    registerBrowserOverlaySlotViewport("pane-1", slot);
    const viewport = ensureBrowserPageViewport("page-1", "pane-1")!;
    const webview = createWebview();
    registerPersistentWebview("page-1", webview);
    viewport.container.appendChild(webview);

    expect(browserPageGuestNeedsAttach("page-1", webview)).toBe(false);

    const orphanHost = document.createElement("div");
    document.body.appendChild(orphanHost);
    orphanHost.appendChild(webview);
    expect(browserPageGuestNeedsAttach("page-1", webview)).toBe(true);
  });

  it("resolves a connected registry guest when React's ref is stale", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    registerBrowserOverlaySlotViewport("pane-1", slot);
    const viewport = ensureBrowserPageViewport("page-1", "pane-1")!;
    const webview = createWebview();
    registerPersistentWebview("page-1", webview);
    viewport.container.appendChild(webview);

    const ref = { current: null as Electron.WebviewTag | null };
    expect(resolveBrowserPageWebview("page-1", ref)).toBe(webview);
    expect(ref.current).toBe(webview);
  });
});
