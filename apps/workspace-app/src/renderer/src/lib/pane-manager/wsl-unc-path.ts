/** Browser-safe mirror of main `parseWslUncPath` — no Node imports. */
export function isWslUncPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/\//g, "\\");
  return /^\\\\(?:wsl\.localhost|wsl\$)\\[^\\]+\\/i.test(normalized);
}
