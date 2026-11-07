/** POSIX single-quote escaping for WSL `sh -c` payloads (ported from Orca). */
export function quotePosixShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

/** Launch the distro user's login shell after `cd` (Orca wsl-runner pattern). */
export function buildWslInteractiveLoginShellCommand(): string {
  return 'exec "$SHELL" -l';
}

/** Build `wsl.exe` argv without a bare `--` separator (ConPTY-safe). */
export function buildWslExecArgs(execArgv: string[], distro?: string): string[] {
  const shellArgs = ["--exec", ...execArgv];
  return distro ? ["-d", distro, ...shellArgs] : shellArgs;
}
