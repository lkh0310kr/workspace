import { quotePowerShellLiteralPath } from "./powershell-encoding";

/** Minimal PowerShell ConPTY bootstrap: UTF-8 I/O + cwd restore after profiles. */
const POWERSHELL_CONPTY_BOOTSTRAP = `# Workspace PowerShell ConPTY bootstrap.
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
    $OutputEncoding = [Console]::OutputEncoding
} catch { Write-Error $_ -ErrorAction Continue }
`;

export function getPowerShellOsc133Bootstrap(): string {
  return POWERSHELL_CONPTY_BOOTSTRAP;
}

export function getPowerShellRestoreCwdCommand(cwd: string): string {
  const literal = quotePowerShellLiteralPath(cwd);
  return [
    "",
    "# Profiles can change location; restore the PTY cwd after profile loading.",
    `try { Set-Location -LiteralPath ${literal} -ErrorAction Stop } catch { Write-Warning "Failed to restore working directory: $_" }`,
  ].join("\n");
}
