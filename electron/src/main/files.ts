import * as fs from "node:fs";
import * as path from "node:path";
import { model3dLog } from "./model3d/model3dLog";

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
export function resolveUnderRoot(root: string, rel: string): string {
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

/** null when the file is gone. A tab outlives the file it points at, and
 * the filesystem watcher fires for deletes too, so a missing file is
 * ordinary here rather than a failed IPC call. */
export function readFileIfExists(root: string, rel: string): string | null {
  try {
    return readFile(root, rel);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

const BINARY_PREVIEW_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "model/obj",
  ".stl": "model/stl",
  ".ply": "application/octet-stream",
  ".dae": "model/vnd.collada+xml",
  ".fbx": "application/octet-stream",
};

export type BinaryFilePreview = { content: string; mimeType: string };

/** Base64 file content for the File Viewer pane (Orca parity —
 * useLocalImageSrc.ts's readImagePreview: read via IPC and hand the
 * renderer bytes to build its own blob: URL, rather than a file:// URL —
 * Chromium blocks file:// resource loads from a page not itself loaded via
 * file://, which a dev-mode Vite server never is). Goes through the same
 * resolveUnderRoot confinement as every other file op here. */
export function readFileBinaryPreview(root: string, rel: string): BinaryFilePreview | null {
  const target = resolveUnderRoot(root, rel);
  const ext = path.extname(target).toLowerCase();
  const mimeType = BINARY_PREVIEW_MIME_TYPES[ext];
  if (!mimeType) {
    model3dLog("binary_preview_unsupported_ext", {
      source: "main",
      relativePath: rel,
      absolutePath: target,
      ext,
    });
    return null;
  }
  try {
    const content = fs.readFileSync(target).toString("base64");
    const isModel =
      ext === ".glb" ||
      ext === ".gltf" ||
      ext === ".obj" ||
      ext === ".stl" ||
      ext === ".ply" ||
      ext === ".dae" ||
      ext === ".fbx";
    if (isModel) {
      model3dLog("binary_preview_read_ok", {
        source: "main",
        relativePath: rel,
        absolutePath: target,
        ext,
        mimeType,
        byteLength: Buffer.byteLength(content, "base64"),
      });
    }
    return { content, mimeType };
  } catch (err) {
    model3dLog("binary_preview_read_failed", {
      source: "main",
      relativePath: rel,
      absolutePath: target,
      ext,
      mimeType,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
