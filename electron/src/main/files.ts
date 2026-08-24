import * as fs from "node:fs";
import * as path from "node:path";

// Direct port of crates/workspace-core/src/files.rs.

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

/**
 * `fs.realpathSync` requires the full path to already exist — fine for
 * listDir/readFile but wrong for writeFile creating a brand-new file:
 * resolving `root/untitled.md` before that file exists would throw ENOENT,
 * rejecting every "create a new file" call before ever reaching fs.writeFile
 * (ported finding, not re-derived — this exact bug was already found and
 * fixed in the Rust version). Fixed the same way: walk up to whichever
 * prefix of the joined path *does* already exist, resolve just that
 * prefix (same escape-prevention guarantee `startsWith` gave before, just
 * checked against an existing ancestor instead of the full leaf), then
 * re-append the not-yet-existing remainder verbatim.
 */
function resolveUnderRoot(root: string, rel: string): string {
  const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
  if (!rel) return realRoot;
  const joined = path.join(realRoot, rel);

  let existing = joined;
  const remainder: string[] = [];
  while (!fs.existsSync(existing)) {
    const name = path.basename(existing);
    if (!name || existing === path.dirname(existing)) {
      throw new Error("invalid path");
    }
    remainder.push(name);
    existing = path.dirname(existing);
  }

  let canonical = fs.realpathSync(existing);
  if (!(canonical === realRoot || canonical.startsWith(realRoot + path.sep))) {
    throw new Error("path escapes workspace root");
  }
  for (const part of remainder.reverse()) {
    canonical = path.join(canonical, part);
  }
  return canonical;
}

export function listDir(root: string, rel: string): DirEntry[] {
  const dirPath = resolveUnderRoot(root, rel);
  const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
  const names = fs.readdirSync(dirPath, { withFileTypes: true });
  const entries: DirEntry[] = [];
  for (const entry of names) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(dirPath, entry.name);
    const relPath = path.relative(realRoot, entryPath);
    entries.push({ name: entry.name, path: relPath, isDir: entry.isDirectory() });
  }
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export function readFile(root: string, rel: string): string {
  return fs.readFileSync(resolveUnderRoot(root, rel), "utf8");
}

export function writeFile(root: string, rel: string, content: string): void {
  const target = resolveUnderRoot(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

export function createDir(root: string, rel: string): void {
  fs.mkdirSync(resolveUnderRoot(root, rel), { recursive: true });
}

/** `rel` must already exist — checked explicitly rather than forwarding a
 * confusing OS error. */
export function deletePath(root: string, rel: string): void {
  const target = resolveUnderRoot(root, rel);
  const stat = fs.lstatSync(target);
  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true });
  } else {
    fs.unlinkSync(target);
  }
}

export function renamePath(root: string, fromRel: string, toRel: string): void {
  const from = resolveUnderRoot(root, fromRel);
  const to = resolveUnderRoot(root, toRel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}
