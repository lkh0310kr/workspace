export function matchesExcludePattern(path: string, pattern: string): boolean {
  const normalized = pattern.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) return false;
  const escape = (value: string) => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, "\\*?");
  const source = normalized.split("**").map(escape).join(".*").replace(/\\\*\?/g, "[^/]*");
  const expression = new RegExp(normalized.includes("/") ? `^${source}$` : `(^|/)${source}$`);
  const segments = path.split("/");
  return segments.some((_, index) => expression.test(segments.slice(0, index + 1).join("/")) || expression.test(segments[index]));
}
