/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractionCoordinatorImpl } from "./InteractionCoordinator";

function mockWebview(): Electron.WebviewTag {
  const el = document.createElement("webview") as Electron.WebviewTag;
  el.focus = vi.fn();
  return el;
}

function webviewStyles(wv: Electron.WebviewTag) {
  return {
    display: wv.style.display,
    pointerEvents: wv.style.pointerEvents,
    inert: wv.inert,
  };
}

describe("InteractionCoordinator reconcile", () => {
  let coordinator: InteractionCoordinatorImpl;

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function freshCoordinator() {
    coordinator = new InteractionCoordinatorImpl();
    return coordinator;
  }

  function registerBrowser(
    c: InteractionCoordinatorImpl,
    opts: {
      workspaceTabId?: number;
      paneTabItemId?: string;
      paneVisible?: boolean;
      chipActive?: boolean;
    } = {},
  ) {
    const webview = mockWebview();
    document.body.appendChild(webview);
    c.registerWebview(webview, {
      workspaceTabId: opts.workspaceTabId ?? 1,
      paneNodeId: "pane-1",
      paneTabItemId: opts.paneTabItemId ?? "browser-1",
      initialPaneVisible: opts.paneVisible ?? true,
      initialChipActive: opts.chipActive ?? true,
    });
    return webview;
  }

  it("shows interactive webview when workspace tab, pane, and chip are active", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(1);

    expect(webviewStyles(wv)).toEqual({
      display: "flex",
      pointerEvents: "auto",
      inert: false,
    });
  });

  it("hides webview when workspace tab is inactive", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(2);

    expect(webviewStyles(wv)).toEqual({
      display: "none",
      pointerEvents: "none",
      inert: true,
    });
  });

  it("hides webview when pane is not visible", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c, { paneVisible: false });
    c.setActiveWorkspaceTab(1);

    expect(webviewStyles(wv).display).toBe("none");
  });

  it("hides webview when chip is inactive", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c, { chipActive: false });
    c.setActiveWorkspaceTab(1);

    expect(webviewStyles(wv).display).toBe("none");
  });

  it("hides webview while overlay is blocked", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(1);
    c.pushOverlayBlock("splitter-drag");

    expect(webviewStyles(wv).display).toBe("none");
  });

  it("keeps webview visible but blocks input while a portal is open", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(1);
    c.registerPortal("menu", () => {});

    expect(webviewStyles(wv)).toEqual({
      display: "flex",
      pointerEvents: "none",
      inert: true,
    });
  });

  it("updates policy when pane visibility changes", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(1);
    c.setBrowserPaneVisible(1, "browser-1", false);

    expect(webviewStyles(wv).display).toBe("none");
  });

  it("updates policy when chip active changes", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(1);
    c.setBrowserChipActive(1, "browser-1", false);

    expect(webviewStyles(wv).display).toBe("none");
  });

  it("focuses webview when chip becomes active and guest is interactive", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c, { chipActive: false });
    c.setActiveWorkspaceTab(1);
    c.setBrowserChipActive(1, "browser-1", true);

    expect(wv.focus).toHaveBeenCalled();
  });

  it("does not focus webview when chip becomes active but guest is hidden", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c, { chipActive: false, paneVisible: false });
    c.setActiveWorkspaceTab(1);
    c.setBrowserChipActive(1, "browser-1", true);

    expect(wv.focus).not.toHaveBeenCalled();
  });

  it("hides webview on unregister", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(1);
    c.unregisterWebview(wv);

    expect(webviewStyles(wv)).toEqual({
      display: "none",
      pointerEvents: "none",
      inert: true,
    });
    expect(c.getSnapshot().registeredWebviewCount).toBe(0);
  });

  it("hides orphan webviews in the DOM", () => {
    const c = freshCoordinator();
    const orphan = mockWebview();
    const host = document.createElement("div");
    host.setAttribute("data-workspace-tab-id", "1");
    host.appendChild(orphan);
    document.body.appendChild(host);

    c.setActiveWorkspaceTab(1);
    c.reconcile("test-orphan");

    expect(webviewStyles(orphan)).toEqual({
      display: "none",
      pointerEvents: "none",
      inert: true,
    });
  });

  it("only shows the active chip among multiple browser panes", () => {
    const c = freshCoordinator();
    const active = registerBrowser(c, { paneTabItemId: "browser-a", chipActive: true });
    const inactive = registerBrowser(c, { paneTabItemId: "browser-b", chipActive: false });
    c.setActiveWorkspaceTab(1);

    expect(webviewStyles(active).display).toBe("flex");
    expect(webviewStyles(inactive).display).toBe("none");
  });

  it("restores visibility after overlay pop", () => {
    const c = freshCoordinator();
    const wv = registerBrowser(c);
    c.setActiveWorkspaceTab(1);
    c.pushOverlayBlock("drag");
    c.popOverlayBlock("drag");

    expect(webviewStyles(wv).display).toBe("flex");
  });
});
