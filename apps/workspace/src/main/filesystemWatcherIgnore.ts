/** High-churn directories to skip when broadcasting fs.watch events (orca / VS Code parity). */
export const WATCHER_IGNORE_DIRS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'target',
  'out',
  '.venv',
  '__pycache__',
] as const;

function pathSegments(rel: string): string[] {
  return rel.replace(/\\/g, '/').split('/').filter(Boolean);
}

/** True when `rel` is under or equals an ignored directory name segment. */
export function shouldIgnoreWatcherPath(rel: string): boolean {
  const segments = pathSegments(rel);
  return segments.some((seg) => (WATCHER_IGNORE_DIRS as readonly string[]).includes(seg));
}
