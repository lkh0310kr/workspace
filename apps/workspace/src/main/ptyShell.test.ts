import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./wslPaths", () => ({
  isWsl: vi.fn(() => false),
  isWslWindowsMountPath: vi.fn((p: string) => /^\/mnt\/[a-zA-Z]\//.test(p)),
}));

import { isWsl } from "./wslPaths";
import { resolvePtySpawn, resolveWindowsPowerShellExecutable } from "./ptyShell";

describe("resolvePtySpawn", () => {
  let platform = "linux";

  beforeEach(() => {
    vi.mocked(isWsl).mockReturnValue(false);
    Object.defineProperty(process, "platform", { configurable: true, value: platform });
  });

  afterEach(() => {
    platform = "linux";
  });

  it("uses PowerShell on native Windows", () => {
    platform = "win32";
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    const spec = resolvePtySpawn("C:\\Users\\me\\project");
    expect(spec.file.toLowerCase()).toContain("powershell.exe");
    expect(spec.args).toEqual(["-NoLogo"]);
    expect(spec.cwd).toBe("C:\\Users\\me\\project");
  });

  it("uses PowerShell for WSL /mnt tab roots", () => {
    vi.mocked(isWsl).mockReturnValue(true);
    const spec = resolvePtySpawn("/mnt/c/Users/me/Documents/bunk");
    expect(spec.file).toBe("powershell.exe");
    expect(spec.args).toEqual(["-NoLogo"]);
    expect(spec.cwd).toBe("/mnt/c/Users/me/Documents/bunk");
  });

  it("uses the Linux login shell for WSL Linux-home tab roots", () => {
    vi.mocked(isWsl).mockReturnValue(true);
    const prev = process.env.SHELL;
    process.env.SHELL = "/bin/bash";
    const spec = resolvePtySpawn("/home/me/workspace");
    expect(spec.file).toBe("/bin/bash");
    expect(spec.args[0]).toBe("-l");
    expect(spec.args[1]).toBe("-c");
    expect(spec.args[2]).toContain("/home/me/workspace");
    process.env.SHELL = prev;
  });
});

describe("resolveWindowsPowerShellExecutable", () => {
  it("returns inbox path on Windows when present, otherwise bare name", () => {
    const resolved = resolveWindowsPowerShellExecutable();
    if (process.platform === "win32") {
      expect(resolved.replace(/\\/g, "/").toLowerCase()).toMatch(/powershell\/v1\.0\/powershell\.exe$/);
    } else {
      expect(resolved).toBe("powershell.exe");
    }
  });
});
