import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./wslPaths", () => ({
  isWsl: vi.fn(() => false),
  isWslWindowsMountPath: vi.fn((p: string) => /^\/mnt\/[a-zA-Z]\//.test(p)),
  parseWslUncPath: vi.fn((p: string) => {
    const unc = /^\\\\wsl\.localhost\\([^\\]+)\\home\\(.+)$/i.exec(p.replace(/\//g, "\\"));
    if (unc) return { distro: unc[1], linuxPath: `/home/${unc[2].replace(/\\/g, "/")}` };
    return null;
  }),
  resolveWslLinuxPathFromWindowsRoot: vi.fn((p: string) => {
    const unc = /^\\\\wsl\.localhost\\([^\\]+)\\home\\(.+)$/i.exec(p.replace(/\//g, "\\"));
    if (unc) return { distro: unc[1], linuxPath: `/home/${unc[2].replace(/\\/g, "/")}` };
    if (/^\/home\//.test(p)) return { distro: "Ubuntu", linuxPath: p };
    return null;
  }),
}));

import { isWsl, resolveWslLinuxPathFromWindowsRoot } from "./wslPaths";
import * as fallbackChain from "./windows/windows-shell-fallback-chain";
import { resolvePtySpawn, resolvePtySpawnAttempts, resolveWslExecutable } from "./ptyShell";

const WINDOWS_POWERSHELL_ATTEMPT = {
  shellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  shellArgs: ["-NoLogo", "-NoExit", "-EncodedCommand", "dGVzdA=="],
  effectiveCwd: "C:\\Users\\me\\project",
  validationCwd: "C:\\Users\\me\\project",
  startupCommandDeliveredInShellArgs: false,
};

const WINDOWS_CMD_ATTEMPT = {
  shellPath: "C:\\Windows\\System32\\cmd.exe",
  shellArgs: ["/K", "chcp 65001 > nul"],
  effectiveCwd: "C:\\Users\\me\\project",
  validationCwd: "C:\\Users\\me\\project",
  startupCommandDeliveredInShellArgs: false,
};

describe("resolvePtySpawn", () => {
  let platform = "linux";

  beforeEach(() => {
    vi.mocked(isWsl).mockReturnValue(false);
    vi.mocked(resolveWslLinuxPathFromWindowsRoot).mockImplementation((p: string) => {
      const unc = /^\\\\wsl\.localhost\\([^\\]+)\\home\\(.+)$/i.exec(p.replace(/\//g, "\\"));
      if (unc) return { distro: unc[1], linuxPath: `/home/${unc[2].replace(/\\/g, "/")}` };
      if (/^\/home\//.test(p)) return { distro: "Ubuntu", linuxPath: p };
      return null;
    });
    Object.defineProperty(process, "platform", { configurable: true, value: platform });
    vi.spyOn(fallbackChain, "buildWindowsPowerShellSpawnAttempts").mockImplementation(({ cwd }) => [
      { ...WINDOWS_POWERSHELL_ATTEMPT, effectiveCwd: cwd, validationCwd: cwd },
      { ...WINDOWS_CMD_ATTEMPT, effectiveCwd: cwd, validationCwd: cwd },
    ]);
  });

  afterEach(() => {
    platform = "linux";
    vi.mocked(fallbackChain.buildWindowsPowerShellSpawnAttempts).mockRestore();
  });

  it("uses PowerShell -EncodedCommand on native Windows", () => {
    platform = "win32";
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    const spec = resolvePtySpawn("C:\\Users\\me\\project");
    expect(spec.file.toLowerCase()).toContain("powershell.exe");
    expect(spec.args.slice(0, 3)).toEqual(["-NoLogo", "-NoExit", "-EncodedCommand"]);
    expect(spec.cwd).toBe("C:\\Users\\me\\project");
  });

  it("uses wsl.exe Orca sh -c pattern for native Windows WSL tab roots", () => {
    platform = "win32";
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    const prevProfile = process.env.USERPROFILE;
    process.env.USERPROFILE = "C:\\Users\\alice";
    const spec = resolvePtySpawn("\\\\wsl.localhost\\Ubuntu\\home\\me\\workspace");
    expect(spec.file.toLowerCase()).toContain("wsl.exe");
    expect(spec.args).toEqual([
      "-d",
      "Ubuntu",
      "--exec",
      "sh",
      "-c",
      `cd '/home/me/workspace' && export PATH="$HOME/.local/bin:$PATH" && exec "$SHELL" -l`,
    ]);
    expect(spec.cwd).toBe("C:\\Users\\alice");
    process.env.USERPROFILE = prevProfile;
  });

  it("returns multiple fallback attempts on Windows PowerShell", () => {
    platform = "win32";
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    const attempts = resolvePtySpawnAttempts("C:\\Users\\me\\project");
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts.at(-1)?.file.toLowerCase()).toContain("cmd.exe");
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

describe("resolveWslExecutable", () => {
  it("returns inbox path on Windows when present, otherwise bare name", () => {
    const resolved = resolveWslExecutable();
    if (process.platform === "win32") {
      expect(resolved.replace(/\\/g, "/").toLowerCase()).toMatch(/system32\/wsl\.exe$/);
    } else {
      expect(resolved).toBe("wsl.exe");
    }
  });
});
