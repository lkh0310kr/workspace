import { describe, expect, it } from "vitest";
import {
  isWindowsHostedWslRootPath,
  parseWslUncPath,
  resolveUserSelectedRootPath,
  resolveWslLinuxPathFromWindowsRoot,
  wslPathToWindows,
} from "./wslPaths";

describe("parseWslUncPath", () => {
  it("parses wsl.localhost UNC paths", () => {
    expect(parseWslUncPath("\\\\wsl.localhost\\Ubuntu\\home\\me\\workspace")).toEqual({
      distro: "Ubuntu",
      linuxPath: "/home/me/workspace",
    });
  });

  it("parses wsl$ UNC paths", () => {
    expect(parseWslUncPath("\\\\wsl$\\Ubuntu\\home\\me\\workspace")).toEqual({
      distro: "Ubuntu",
      linuxPath: "/home/me/workspace",
    });
  });
});

describe("resolveWslLinuxPathFromWindowsRoot", () => {
  it("returns null on non-Windows platforms", () => {
    if (process.platform === "win32") return;
    expect(resolveWslLinuxPathFromWindowsRoot("/home/me/workspace")).toBeNull();
  });

  it("maps typed /home paths on Windows", () => {
    if (process.platform !== "win32") return;
    expect(resolveWslLinuxPathFromWindowsRoot("/home/me/workspace")).toEqual({
      distro: process.env.WSL_DISTRO_NAME || "Ubuntu",
      linuxPath: "/home/me/workspace",
    });
  });
});

describe("resolveUserSelectedRootPath on Windows host", () => {
  it("normalizes /home paths to wsl.localhost UNC", () => {
    if (process.platform !== "win32") return;
    const distro = process.env.WSL_DISTRO_NAME || "Ubuntu";
    expect(resolveUserSelectedRootPath("/home/me/workspace")).toBe(
      `\\\\wsl.localhost\\${distro}\\home\\me\\workspace`,
    );
  });
});

describe("isWindowsHostedWslRootPath", () => {
  it("detects UNC and posix WSL roots on Windows", () => {
    if (process.platform !== "win32") return;
    expect(isWindowsHostedWslRootPath("\\\\wsl.localhost\\Ubuntu\\home\\me\\workspace")).toBe(true);
    expect(isWindowsHostedWslRootPath("/home/me/workspace")).toBe(true);
    expect(isWindowsHostedWslRootPath("C:\\Users\\me\\project")).toBe(false);
  });
});

describe("wslPathToWindows on Windows host", () => {
  it("maps /home paths without running inside WSL", () => {
    if (process.platform !== "win32") return;
    const distro = process.env.WSL_DISTRO_NAME || "Ubuntu";
    expect(wslPathToWindows("/home/me/workspace")).toBe(
      `\\\\wsl.localhost\\${distro}\\home\\me\\workspace`,
    );
  });
});
