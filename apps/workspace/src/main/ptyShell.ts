import * as fs from "node:fs";
import * as path from "node:path";
import {
  isWsl,
  isWslWindowsMountPath,
  parseWslUncPath,
  resolveWslLinuxPathFromWindowsRoot,
} from "./wslPaths";
import { getWindowsCmdPath, resolveWindowsPowerShellExecutablePath } from "./windows/windows-powershell-executable";
import { resolveWindowsShellLaunchArgs } from "./windows/windows-shell-args";
import { buildWindowsPowerShellSpawnAttempts } from "./windows/windows-shell-fallback-chain";

export interface PtySpawnSpec {
  file: string;
  args: string[];
  cwd?: string;
}

function shellQuoteSingle(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

/** Inbox `wsl.exe` — avoid App Execution Alias stubs that ConPTY rejects. */
export function resolveWslExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const inbox = path.join(systemRoot, "System32", "wsl.exe");
  try {
    if (fs.existsSync(inbox) && fs.statSync(inbox).isFile()) return inbox;
  } catch {
    // fall through
  }
  return "wsl.exe";
}

/** Preferred Windows PowerShell executable (pwsh when installed, else inbox). */
export function resolveWindowsPowerShellExecutable(): string {
  const pwsh = resolveWindowsPowerShellExecutablePath("pwsh.exe");
  if (pwsh) return pwsh;
  const inbox = resolveWindowsPowerShellExecutablePath("powershell.exe");
  if (inbox) return inbox;
  return getWindowsCmdPath();
}

/** Linux login shell with an explicit cd on WSL (PTY cwd is often ignored). */
function linuxLoginShellArgv(shell: string, cwd: string): PtySpawnSpec {
  const base = shell.endsWith("bash") ? "bash" : shell.endsWith("zsh") ? "zsh" : (shell.split("/").pop() ?? "bash");
  return {
    file: shell,
    args: ["-l", "-c", `cd ${shellQuoteSingle(cwd)} && exec ${base} -l`],
    cwd,
  };
}

function resolveWin32SpawnAttempts(cwd?: string): PtySpawnSpec[] {
  const defaultCwd = process.env.USERPROFILE ?? process.env.HOME ?? "C:\\Users\\Default";
  const effectiveCwd = cwd ?? defaultCwd;
  const wslRoot = cwd ? resolveWslLinuxPathFromWindowsRoot(cwd) : null;

  if (wslRoot) {
    const resolved = resolveWindowsShellLaunchArgs(
      resolveWslExecutable(),
      cwd!,
      defaultCwd,
      parseWslUncPath(cwd!)
        ? { distro: wslRoot.distro }
        : { distro: wslRoot.distro, treatPosixCwdAsWsl: true },
    );
    return [
      {
        file: resolveWslExecutable(),
        args: resolved.shellArgs,
        cwd: resolved.effectiveCwd,
      },
    ];
  }

  const shellPath = resolveWindowsPowerShellExecutable();
  const attempts = buildWindowsPowerShellSpawnAttempts({
    shellPath,
    cwd: effectiveCwd,
    defaultCwd,
  });
  if (attempts.length > 0) {
    return attempts.map((attempt) => ({
      file: attempt.shellPath,
      args: attempt.shellArgs,
      cwd: attempt.effectiveCwd,
    }));
  }

  const resolved = resolveWindowsShellLaunchArgs(getWindowsCmdPath(), effectiveCwd, defaultCwd);
  return [
    {
      file: getWindowsCmdPath(),
      args: resolved.shellArgs,
      cwd: resolved.effectiveCwd,
    },
  ];
}

/**
 * Ordered spawn attempts for a new terminal pane. On Windows PowerShell this
 * follows Orca's pwsh → inbox PowerShell → cmd.exe fallback chain.
 */
export function resolvePtySpawnAttempts(cwd?: string): PtySpawnSpec[] {
  if (process.platform === "win32") {
    return resolveWin32SpawnAttempts(cwd);
  }

  if (isWsl() && cwd && isWslWindowsMountPath(cwd)) {
    return [{ file: "powershell.exe", args: ["-NoLogo"], cwd }];
  }

  const shell = process.env.SHELL || "/bin/bash";
  if (!cwd || !isWsl()) {
    return [{ file: shell, args: ["-l"], cwd }];
  }

  return [linuxLoginShellArgv(shell, cwd)];
}

/** First spawn attempt (legacy single-spec API). */
export function resolvePtySpawn(cwd?: string): PtySpawnSpec {
  return resolvePtySpawnAttempts(cwd)[0];
}
