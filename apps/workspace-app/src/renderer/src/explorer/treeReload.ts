/** Parent directories to re-list after an external file change. */
export function dirsToReloadForChange(changedRel: string, expanded: Set<string>): string[] {
  const out = new Set<string>([""]);
  if (!changedRel) return [...out];
  let dir = changedRel.includes("/") ? changedRel.slice(0, changedRel.lastIndexOf("/")) : "";
  while (true) {
    if (dir === "" || expanded.has(dir)) out.add(dir);
    if (!dir) break;
    const idx = dir.lastIndexOf("/");
    dir = idx === -1 ? "" : dir.slice(0, idx);
  }
  return [...out];
}
