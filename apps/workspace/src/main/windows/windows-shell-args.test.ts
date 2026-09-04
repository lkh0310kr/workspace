import { describe, expect, it } from "vitest";
import {
  buildWslInteractiveLoginShellCommand,
  quotePosixShell,
} from "./wsl-login-shell-command";
import { resolveWindowsShellLaunchArgs } from "./windows-shell-args";

function decodePowerShellCommand(
  result: ReturnType<typeof resolveWindowsShellLaunchArgs>,
): string {
  expect(result.shellArgs.slice(0, 3)).toEqual(["-NoLogo", "-NoExit", "-EncodedCommand"]);
  return Buffer.from(result.shellArgs[3] ?? "", "base64").toString("utf16le");
}

function expectedWslArgs(linuxCwd: string, distro?: string): string[] {
  const command = `cd ${quotePosixShell(linuxCwd)} && export PATH="$HOME/.local/bin:$PATH" && ${buildWslInteractiveLoginShellCommand()}`;
  const shellArgs = ["--exec", "sh", "-c", command];
  return distro ? ["-d", distro, ...shellArgs] : shellArgs;
}

describe("resolveWindowsShellLaunchArgs", () => {
  it("returns cmd.exe args with chcp 65001 for UTF-8 output", () => {
    const result = resolveWindowsShellLaunchArgs(
      "cmd.exe",
      "C:\\Users\\alice",
      "C:\\Users\\alice",
    );
    expect(result.shellArgs).toEqual(["/K", "chcp 65001 > nul"]);
    expect(result.effectiveCwd).toBe("C:\\Users\\alice");
  });

  it("returns PowerShell -EncodedCommand bootstrap with cwd restore", () => {
    const result = resolveWindowsShellLaunchArgs(
      "powershell.exe",
      "C:\\Users\\alice\\project",
      "C:\\Users\\alice",
    );
    const decoded = decodePowerShellCommand(result);
    expect(decoded).toContain("UTF8Encoding");
    expect(decoded).toContain("Set-Location -LiteralPath 'C:\\Users\\alice\\project'");
  });

  it("builds wsl.exe args via sh -c login shell", () => {
    const result = resolveWindowsShellLaunchArgs(
      "wsl.exe",
      "\\\\wsl.localhost\\Ubuntu\\home\\me\\workspace",
      "C:\\Users\\alice",
    );
    expect(result.shellArgs).toEqual(expectedWslArgs("/home/me/workspace", "Ubuntu"));
    expect(result.effectiveCwd).toBe("C:\\Users\\alice");
    expect(result.validationCwd).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\workspace");
  });

  it("normalizes MSYS /d/repo cwd for PowerShell", () => {
    const result = resolveWindowsShellLaunchArgs(
      "powershell.exe",
      "/d/repo",
      "C:\\Users\\alice",
    );
    const decoded = decodePowerShellCommand(result);
    expect(decoded).toContain("Set-Location -LiteralPath 'D:\\repo'");
  });
});
