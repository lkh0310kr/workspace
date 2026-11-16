// Asset system (Phase 1 foundation — see docs/planning/roadmap.md and
// docs/planning/context-modeling.md's Resource/"physical
// decentralization, semantic centralization" sections). Scoped to the
// one concrete duplication that already exists in this codebase: "what
// kind of file is this" is independently reimplemented as an extension
// list in TreeView.tsx (VIEWER_EXTENSIONS) and as separate MIME-type
// maps in mediaProtocol.ts. This file gives the
// *classification* half one canonical place — not a registry/database
// (no AssetRef store, no central copy of anything: per
// context-modeling.md, an asset stays wherever it already lives; this
// only answers "what type is it").
//
// No `electron`/`node:*` import here (kept portable — usable from both
// main and renderer, same as layoutSalvage.ts), so extname is
// hand-rolled rather than using node:path.

import {
  AUDIO_EXTENSIONS,
  CAD_VIEWER_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MODEL3D_EXTENSIONS,
  VIDEO_EXTENSIONS
} from './mediaExtensions'

export type AssetType =
  'image' | 'video' | 'audio' | 'pdf' | 'ebook' | 'markdown' | 'model3d' | 'cad' | 'unknown'

function extname(pathOrName: string): string {
  const base = pathOrName.slice(pathOrName.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

// Deliberately the *exact* extension set TreeView.tsx's VIEWER_EXTENSIONS
// already covered — consolidating the duplicated knowledge, not silently
// widening what counts as "viewer" content in the same change (e.g. font
// files/.ico aren't classified here even though they're clearly assets
// too — adding them is a real, separate follow-up, not an incidental
// side effect of extracting existing behavior).
const extensionEntries: [string, AssetType][] = [
  ...IMAGE_EXTENSIONS.map((extension): [string, AssetType] => [extension, 'image']),
  ...VIDEO_EXTENSIONS.map((extension): [string, AssetType] => [extension, 'video']),
  ...AUDIO_EXTENSIONS.map((extension): [string, AssetType] => [extension, 'audio']),
  ...MODEL3D_EXTENSIONS.map((extension): [string, AssetType] => [extension, 'model3d']),
  ...CAD_VIEWER_EXTENSIONS.map((extension): [string, AssetType] => [extension, 'cad']),
  ['.pdf', 'pdf'],
  ['.epub', 'ebook'],
  ['.md', 'markdown'],
  ['.markdown', 'markdown']
]

const EXTENSION_TYPES: Record<string, AssetType> = Object.fromEntries(extensionEntries)

export function classifyAssetType(pathOrName: string): AssetType {
  return EXTENSION_TYPES[extname(pathOrName)] ?? 'unknown'
}

export function assetBaseName(pathOrName: string): string {
  const idx = pathOrName.lastIndexOf('/')
  return idx === -1 ? pathOrName : pathOrName.slice(idx + 1)
}
