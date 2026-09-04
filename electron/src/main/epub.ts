import { protocol } from 'electron'
import * as path from 'node:path'
import AdmZip from 'adm-zip'
import { resolveUnderRoot } from './files'
import { inspectEpubZip } from './epubInspect'
import { EPUB_SCHEME } from './protocolSchemeTable'
import type { EpubBook, EpubSpineItem } from './epubTypes'

export type { EpubBook, EpubSpineItem }

export { EPUB_SCHEME } from './protocolSchemeTable'

interface EpubSession {
  zip: AdmZip
  opfDir: string
}

const sessions = new Map<string, EpubSession>()

export async function openEpub(root: string, rel: string): Promise<EpubBook> {
  const absolutePath = resolveUnderRoot(root, rel)
  return parseEpubZip(new AdmZip(absolutePath), path.basename(rel))
}

export async function openEpubAbsolute(absolutePath: string): Promise<EpubBook> {
  return parseEpubZip(new AdmZip(absolutePath), path.basename(absolutePath))
}

async function parseEpubZip(zip: AdmZip, titleFallback: string): Promise<EpubBook> {
  const inspected = await inspectEpubZip(zip, titleFallback)
  const bookId = crypto.randomUUID()
  sessions.set(bookId, { zip, opfDir: inspected.opfDir })
  return { bookId, title: inspected.title, spine: inspected.spine, sizes: inspected.sizes }
}

const RESOURCE_MIME_TYPES: Record<string, string> = {
  '.xhtml': 'application/xhtml+xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

export function registerEpubProtocol(): void {
  protocol.handle(EPUB_SCHEME, async (request) => {
    const url = new URL(request.url)
    const session = sessions.get(url.hostname)
    if (!session) return new Response('not found', { status: 404 })

    const entryPath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const entry = session.zip.getEntry(entryPath)
    if (!entry) return new Response('not found', { status: 404 })

    const bytes = new Uint8Array(entry.getData())
    const contentType = RESOURCE_MIME_TYPES[path.extname(entryPath).toLowerCase()] ?? 'application/octet-stream'
    return new Response(bytes, {
      headers: {
        'content-type': contentType,
        'content-length': String(bytes.byteLength)
      }
    })
  })
}

export function toEpubUrl(bookId: string, entryHref: string): string {
  return `${EPUB_SCHEME}://${bookId}/${entryHref}`
}
