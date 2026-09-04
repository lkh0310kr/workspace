/**
 * Live preview watch helpers for vibe-CAD (terminal agent writes mesh → viewer refreshes).
 *
 * Pattern reference: ref-proj/yet-another-cad-viewer/frontend/misc/network.ts
 * (hash/change detection → reload model URL). Workspace already has fs:changed;
 * we only decide whether a change should refresh the open preview.
 */

const TEXTURE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".ktx2", ".basis"]);

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

function stemAndExt(p: string): { stem: string; ext: string } {
  const name = basename(p);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot).toLowerCase() };
}

/** Append/replace a cache-bust query so Three.js FileLoader cannot reuse a stale fetch. */
export function withModelCacheBust(url: string, revision: number): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("v", String(revision));
    return parsed.toString();
  } catch {
    const cleaned = url.replace(/([?&])v=\d+(&|$)/, (_m, sep, end) => (end === "&" ? sep : ""));
    const sep = cleaned.includes("?") ? "&" : "?";
    return `${cleaned}${sep}v=${revision}`;
  }
}

/**
 * Whether a workspace fs:changed payload should reload the open model preview.
 * Empty/blank paths mean "unknown churn" → reload (same as TreeView full refresh).
 */
export function shouldReloadModelPreview(openPath: string, changedPaths: string[]): boolean {
  const open = normalizeRel(openPath);
  if (!open) return false;

  if (changedPaths.length === 0 || changedPaths.every((p) => !p)) return true;

  const openParts = stemAndExt(open);
  const openDir = dirname(open);
  const openIsGltfPackage = openParts.ext === ".gltf";

  for (const raw of changedPaths) {
    if (!raw) return true;
    const changed = normalizeRel(raw);
    if (changed === open) return true;

    const changedParts = stemAndExt(changed);
    if (dirname(changed) !== openDir) continue;

    // Same stem siblings: part.obj ↔ part.mtl, model.gltf ↔ model.bin
    if (changedParts.stem === openParts.stem) return true;

    // glTF JSON packages often reference differently-named .bin / textures in the same folder.
    if (openIsGltfPackage) {
      if (changedParts.ext === ".bin" || TEXTURE_EXTS.has(changedParts.ext)) return true;
    }
  }

  return false;
}
