/** Encode a script for PowerShell `-EncodedCommand` (UTF-16LE base64). */
export function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, "utf16le").toString("base64");
}

/** Single-quoted PowerShell literal for `-EncodedCommand` bootstrap paths. */
export function quotePowerShellLiteralPath(cwd: string): string {
  return `'${cwd.replace(/'/g, "''")}'`;
}
