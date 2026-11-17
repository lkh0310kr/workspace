import type { CadViewerOpenResult } from '../../../../../../shared/cadViewer'
import type { SceneManifest } from '../../../../../../shared/model3d/types'

export async function getMediaUrl(
  tabId: number,
  path: string,
  expectedRootPath?: string
): Promise<string | null> {
  return window.api.media.getUrl(tabId, path, expectedRootPath)
}

export async function getMediaUrlAbsolute(absolutePath: string): Promise<string> {
  return window.api.media.getUrlAbsolute(absolutePath)
}

export async function openModelPreview(tabId: number, rel: string): Promise<SceneManifest> {
  if (!window.api.model3d?.openPreview) {
    throw new Error('model3d API unavailable — restart the app')
  }
  return window.api.model3d.openPreview(tabId, rel)
}

export async function openCadViewerFile(
  tabId: number,
  rel: string
): Promise<CadViewerOpenResult> {
  if (!window.api.cad?.openFile) {
    throw new Error('cad API unavailable — restart the app')
  }
  return window.api.cad.openFile(tabId, rel)
}

export interface EpubSpineItem {
  href: string
  mediaType: string
}

export interface EpubBook {
  bookId: string
  title: string
  spine: EpubSpineItem[]
  sizes: Record<string, number>
}

export async function openEpub(tabId: number, path: string): Promise<EpubBook> {
  return window.api.epub.open(tabId, path)
}

export async function openEpubAbsolute(absolutePath: string): Promise<EpubBook> {
  return window.api.epub.openAbsolute(absolutePath)
}

export async function getEbookState(
  tabId: number | null,
  rel: string | null,
  absolutePath?: string
): Promise<import('../../../../../../shared/ebookState').EbookBookState> {
  return window.api.epub.getState(tabId, rel, absolutePath)
}

export async function saveEbookState(
  tabId: number | null,
  rel: string | null,
  absolutePath: string | undefined,
  patch: Partial<import('../../../../../../shared/ebookState').EbookBookState>
): Promise<import('../../../../../../shared/ebookState').EbookBookState> {
  return window.api.epub.saveState(tabId, rel, absolutePath, patch)
}

export async function pickMediaFileDialog(
  kind: 'video' | 'audio' | 'ebook'
): Promise<string | null> {
  const result = await window.api.dialog.pickMediaFile(kind)
  if (result.ok) return result.path
  if (!result.canceled && result.error) throw new Error(result.error)
  return null
}
