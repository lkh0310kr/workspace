import * as fs from "node:fs";
import * as path from "node:path";
import { isWsl, isWslWindowsMountPath } from "./wslPaths";

export interface PtySpawnSpec {
  file: string;
  args: string[];
  cwd?: string;
}

function shellQuoteSingle(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

/** Inbox Windows PowerShell — avoid bare `powershell.exe` (App Execution Alias stubs). */
export function resolveWindowsPowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const inbox = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    if (fs.existsSync(inbox) && fs.statSync(inbox).isFile()) return inbox;
  } catch {
    // fall through
  }
  return "powershell.exe";
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

/**
 * Pick the shell for a new terminal pane.
 * - Native Windows → PowerShell in the tab root (Windows path).
 * - WSL + `/mnt/<drive>/…` tab root → PowerShell (Windows side), not a Linux login shell.
 * - WSL + Linux home tab root → user's login shell (bash/zsh).
 */
export function resolvePtySpawn(cwd?: string): PtySpawnSpec {
  if (process.platform === "win32") {
    return {
      file: resolveWindowsPowerShellExecutable(),
      args: ["-NoLogo"],
      cwd,
    };
  }

  if (isWsl() && cwd && isWslWindowsMountPath(cwd)) {
    return {
      file: "powershell.exe",
      args: ["-NoLogo"],
      cwd,
    };
  }

  const shell = process.env.SHELL || "/bin/bash";
  if (!cwd || !isWsl()) {
    return { file: shell, args: ["-l"], cwd };
  }

  return linuxLoginShellArgv(shell, cwd);
}
