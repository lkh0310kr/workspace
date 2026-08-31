/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  applyBrowserPageViewportLayout,
  ensureBrowserPageViewport,
  parkBrowserPageViewport,
  registerBrowserOverlaySlotViewport,
  resetBrowserPageViewportsForTests,
} from "./browserPageViewport";

describe("browserPageViewport", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetBrowserPageViewportsForTests();
  });

  it("mounts page viewports into the pane overlay slot", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    registerBrowserOverlaySlotViewport("pane-1", slot);

    const viewport = ensureBrowserPageViewport("page-1", "pane-1");
    expect(viewport).not.toBeNull();
    expect(slot.contains(viewport!.shell)).toBe(true);
    expect(viewport!.chromeInset).toBeTruthy();
  });

  it("reuses the same shell while it stays in the overlay slot", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    registerBrowserOverlaySlotViewport("pane-1", slot);
    const first = ensureBrowserPageViewport("page-1", "pane-1")!;
    const second = ensureBrowserPageViewport("page-1", "pane-1")!;
    expect(second.shell).toBe(first.shell);
    expect(second.container).toBe(first.container);
  });

  it("applies paintable and active layout to the shell", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    registerBrowserOverlaySlotViewport("pane-1", slot);
    ensureBrowserPageViewport("page-1", "pane-1");

    applyBrowserPageViewportLayout("page-1", { paintable: true, active: true });
    const shell = document.querySelector<HTMLElement>('[data-browser-page-viewport-id="page-1"]')!;
    expect(shell.style.display).toBe("flex");
    expect(shell.inert).toBe(false);

    applyBrowserPageViewportLayout("page-1", { paintable: false, active: false });
    expect(shell.style.display).toBe("none");
    expect(shell.inert).toBe(true);
  });

  it("parks the viewport without removing the guest container", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    registerBrowserOverlaySlotViewport("pane-1", slot);
    const viewport = ensureBrowserPageViewport("page-1", "pane-1")!;
    const guest = document.createElement("webview");
    viewport.container.appendChild(guest);

    parkBrowserPageViewport("page-1");
    expect(viewport.shell.style.display).toBe("none");
    expect(viewport.container.contains(guest)).toBe(true);
  });
});
