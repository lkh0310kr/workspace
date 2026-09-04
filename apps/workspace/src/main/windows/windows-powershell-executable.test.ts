import { describe, expect, it } from "vitest";
import {
  getWindowsCmdPath,
  resolveWindowsPowerShellExecutablePath,
  resolveWindowsPowerShellSpawnChain,
} from "./windows-powershell-executable";

const WIN_ENV: NodeJS.ProcessEnv = {
  ProgramW6432: "C:\\Program Files",
  "ProgramFiles(x86)": "C:\\Program Files (x86)",
  LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
  SystemRoot: "C:\\Windows",
  ComSpec: "C:\\Windows\\System32\\cmd.exe",
};

const PWSH7 = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
const WINDOWS_POWERSHELL =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const PWSH_STORE_ALIAS =
  "C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe";

describe("resolveWindowsPowerShellExecutablePath", () => {
  it("returns null on non-Windows platforms", () => {
    expect(
      resolveWindowsPowerShellExecutablePath("pwsh.exe", {
        platform: "linux",
        env: WIN_ENV,
        isRealExecutable: () => true,
      }),
    ).toBeNull();
  });

  it("resolves pwsh.exe to Program Files install", () => {
    expect(
      resolveWindowsPowerShellExecutablePath("pwsh.exe", {
        platform: "win32",
        env: WIN_ENV,
        isRealExecutable: (p) => p === PWSH7,
      }),
    ).toBe(PWSH7);
  });

  it("never resolves pwsh.exe to the Store App Execution Alias stub", () => {
    const resolved = resolveWindowsPowerShellExecutablePath("pwsh.exe", {
      platform: "win32",
      env: WIN_ENV,
      isRealExecutable: (p) => p === PWSH_STORE_ALIAS,
    });
    expect(resolved).toBeNull();
  });

  it("resolves powershell.exe to inbox Windows PowerShell", () => {
    expect(
      resolveWindowsPowerShellExecutablePath("powershell.exe", {
        platform: "win32",
        env: WIN_ENV,
        isRealExecutable: (p) => p === WINDOWS_POWERSHELL,
      }),
    ).toBe(WINDOWS_POWERSHELL);
  });
});

describe("resolveWindowsPowerShellSpawnChain", () => {
  it("ends with cmd.exe as last resort", () => {
    const chain = resolveWindowsPowerShellSpawnChain("powershell.exe", {
      platform: "win32",
      env: WIN_ENV,
      isRealExecutable: (p) => p === WINDOWS_POWERSHELL || p.endsWith("cmd.exe"),
    });
    expect(chain.at(-1)).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(chain[0]).toBe(WINDOWS_POWERSHELL);
  });
});

describe("getWindowsCmdPath", () => {
  it("prefers ComSpec", () => {
    expect(getWindowsCmdPath(WIN_ENV)).toBe("C:\\Windows\\System32\\cmd.exe");
  });
});
