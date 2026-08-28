import { describe, expect, it } from "vitest";
import { windowsPathToWsl, wslPathToWindows } from "./wslPaths";

describe("windowsPathToWsl", () => {
  it("maps drive letters to /mnt/<drive>", () => {
    expect(windowsPathToWsl("C:\\Users\\me\\workspace")).toBe("/mnt/c/Users/me/workspace");
  });
});

describe("wslPathToWindows", () => {
  it("maps /mnt paths back to Windows drive paths", () => {
    expect(wslPathToWindows("/mnt/c/Users/me/workspace")).toBe("C:\\Users\\me\\workspace");
  });

  it("returns null for non-mount paths", () => {
    expect(wslPathToWindows("/home/me/workspace")).toBeNull();
  });
});
