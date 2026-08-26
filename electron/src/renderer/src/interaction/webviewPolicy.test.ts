import { describe, expect, it } from "vitest";
import { resolveOrphanWebviewPolicy, resolveWebviewPolicy } from "./webviewPolicy";

const base = {
  workspaceTabId: 1,
  paneVisible: true,
  activeWorkspaceTabId: 1,
  overlayBlocked: false,
  portalsOpen: false,
};

describe("webviewPolicy", () => {
  it("shows and enables input for active visible pane", () => {
    expect(resolveWebviewPolicy(base)).toEqual({ visible: true, interactive: true });
  });

  it("hides when workspace tab is inactive", () => {
    expect(resolveWebviewPolicy({ ...base, activeWorkspaceTabId: 2 })).toEqual({
      visible: false,
      interactive: false,
    });
  });

  it("hides when pane chip is not live", () => {
    expect(resolveWebviewPolicy({ ...base, paneVisible: false })).toEqual({
      visible: false,
      interactive: false,
    });
  });

  it("hides during drag overlay but portals keep page visible", () => {
    expect(resolveWebviewPolicy({ ...base, overlayBlocked: true })).toEqual({
      visible: false,
      interactive: false,
    });
    expect(resolveWebviewPolicy({ ...base, portalsOpen: true })).toEqual({
      visible: true,
      interactive: false,
    });
  });

  it("resolves orphan webviews from host workspace tab", () => {
    expect(resolveOrphanWebviewPolicy(1, 1, false, false)).toEqual({
      visible: true,
      interactive: true,
    });
    expect(resolveOrphanWebviewPolicy(1, 2, false, false)).toEqual({
      visible: false,
      interactive: false,
    });
    expect(resolveOrphanWebviewPolicy(null, 1, false, false)).toEqual({
      visible: false,
      interactive: false,
    });
  });
});
