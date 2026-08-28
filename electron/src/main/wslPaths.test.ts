import { describe, expect, it } from "vitest";
import {
  isWslWindowsMountPath,
  preferNativeWorkspacePath,
  remapWorkspaceRootsInSnapshot,
} from "./wslPaths";

describe("wslPaths", () => {
  it("leaves non-mount paths unchanged", () => {
    expect(preferNativeWorkspacePath("/home/user/workspace")).toBe("/home/user/workspace");
    expect(preferNativeWorkspacePath("/tmp")).toBe("/tmp");
  });

  it("remaps snapshot roots when preferNative would change them", () => {
    const snap = {
      tabs: [{ rootPath: "/mnt/c/Users/x/Documents/workspace/electron" }],
      activeTabId: 0,
    };
    const out = remapWorkspaceRootsInSnapshot(snap);
    if (!isWslWindowsMountPath("/mnt/c/Users/x/Documents/workspace/electron")) {
      expect(out).toBe(snap);
    } else {
      expect(out.tabs[0].rootPath.includes("/mnt/c")).toBe(false);
    }
  });
});
