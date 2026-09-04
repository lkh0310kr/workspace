// Asset system (Phase 1 foundation — see docs/ROADMAP.md and
// docs/architecture/08-context-modeling.md's Resource/"physical
// decentralization, semantic centralization" sections). Scoped to the
// one concrete duplication that already exists in this codebase: "what
// kind of file is this" is independently reimplemented as an extension
// list in TreeView.tsx (VIEWER_EXTENSIONS) and as separate MIME-type
// maps in mediaProtocol.ts/engineBundlePaths.ts. This file gives the
// *classification* half one canonical place — not a registry/database
// (no AssetRef store, no central copy of anything: per
// context-modeling.md, an asset stays wherever it already lives; this
// only answers "what type is it").
//
// No `electron`/`node:*` import here (kept portable — usable from both
// main and renderer, same as layoutSalvage.ts), so extname is
// hand-rolled rather than using node:path.

export type AssetType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "ebook"
  | "markdown"
  | "model3d"
  | "hardware-sim"
  | "unknown";

function extname(pathOrName: string): string {
  const base = pathOrName.slice(pathOrName.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

// Deliberately the *exact* extension set TreeView.tsx's VIEWER_EXTENSIONS
// already covered — consolidating the duplicated knowledge, not silently
// widening what counts as "viewer" content in the same change (e.g. font
// files/.ico aren't classified here even though they're clearly assets
// too — adding them is a real, separate follow-up, not an incidental
// side effect of extracting existing behavior).
const EXTENSION_TYPES: Record<string, AssetType> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".svg": "image",
  ".bmp": "image",
  ".pdf": "pdf",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".mkv": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".ogg": "audio",
  ".epub": "ebook",
  ".flac": "audio",
  ".md": "markdown",
  ".markdown": "markdown",
  ".glb": "model3d",
  ".gltf": "model3d",
  ".fbx": "model3d",
  ".obj": "model3d",
  ".stl": "model3d",
  ".ply": "model3d",
  ".dae": "model3d",
};

export function classifyAssetType(pathOrName: string): AssetType {
  if (assetBaseName(pathOrName).toLowerCase() === "hardware-sim.json") {
    return "hardware-sim";
  }
  return EXTENSION_TYPES[extname(pathOrName)] ?? "unknown";
}

export function assetBaseName(pathOrName: string): string {
  const idx = pathOrName.lastIndexOf("/");
  return idx === -1 ? pathOrName : pathOrName.slice(idx + 1);
}
