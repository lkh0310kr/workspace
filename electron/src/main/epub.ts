import { protocol } from 'electron'
import * as path from 'node:path'
import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import { resolveUnderRoot } from './files'

// Minimal v1 EPUB reader (per the confirmed scope: unzip, walk the OPF
// spine in order, render each chapter in a sandboxed iframe with
// prev/next navigation — no bookmarks, no pagination, no TOC panel).
// EPUB is a zip archive of XHTML/CSS/images with a manifest (the OPF
// "package document") that has no native browser renderer the way PDF
// does, so unlike every other File Viewer kind this needs real parsing.

export const EPUB_SCHEME = 'workspace-epub'

protocol.registerSchemesAsPrivileged([
  {
    scheme: EPUB_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

interface EpubSession {
  zip: AdmZip
  opfDir: string
}

const sessions = new Map<string, EpubSession>()

export interface EpubSpineItem {
  href: string // path within the zip, relative to the archive root
  mediaType: string
}

export interface EpubBook {
  bookId: string
  title: string
  spine: EpubSpineItem[]
}

const XHTML_MIME = 'application/xhtml+xml'

function firstText(node: unknown): string | undefined {
  if (Array.isArray(node)) return typeof node[0] === 'string' ? node[0] : undefined
  return typeof node === 'string' ? node : undefined
}

/** Opens an EPUB (workspace-relative path, resolved under the tab's root
 * the same way every other file op in files.ts is) and parses just enough
 * of its package document to drive prev/next chapter navigation. Each
 * call gets a fresh bookId/session — the zip is held in memory for the
 * pane's lifetime; there's no explicit close because the session map is
 * small (one entry per opened book, not per chapter) and this app doesn't
 * have many EPUB tabs open at once in practice. */
export async function openEpub(root: string, rel: string): Promise<EpubBook> {
  const absolutePath = resolveUnderRoot(root, rel)
  return parseEpubZip(new AdmZip(absolutePath), path.basename(rel))
}

/** Same as openEpub, but for a file picked via the native Browse dialog —
 * deliberately not confined to any workspace root. See toMediaUrlBrowsed
 * in mediaProtocol.ts for the identical trust-boundary reasoning: this is
 * only ever called with a path the OS-level picker returned to the main
 * process, never a renderer-supplied string. */
export async function openEpubAbsolute(absolutePath: string): Promise<EpubBook> {
  return parseEpubZip(new AdmZip(absolutePath), path.basename(absolutePath))
}

async function parseEpubZip(zip: AdmZip, titleFallback: string): Promise<EpubBook> {
  const containerEntry = zip.getEntry('META-INF/container.xml')
  if (!containerEntry) throw new Error('not a valid EPUB (missing container.xml)')
  const containerXml = await parseStringPromise(zip.readAsText(containerEntry))
  const opfPath: string | undefined =
    containerXml?.container?.rootfiles?.[0]?.rootfile?.[0]?.$?.['full-path']
  if (!opfPath) throw new Error('not a valid EPUB (missing OPF rootfile)')

  const opfEntry = zip.getEntry(opfPath)
  if (!opfEntry) throw new Error('not a valid EPUB (OPF file missing)')
  const opfXml = await parseStringPromise(zip.readAsText(opfEntry))
  const pkg = opfXml?.package
  if (!pkg) throw new Error('not a valid EPUB (malformed OPF)')

  const opfDir = path.posix.dirname(opfPath)
  const resolveHref = (href: string): string =>
    opfDir === '.' ? href : path.posix.normalize(`${opfDir}/${href}`)

  const manifestItems: { $: Record<string, string> }[] = pkg.manifest?.[0]?.item ?? []
  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const item of manifestItems) {
    const id = item.$?.id
    const href = item.$?.href
    if (!id || !href) continue
    manifest.set(id, { href: resolveHref(href), mediaType: item.$?.['media-type'] ?? XHTML_MIME })
  }

  const spineRefs: { $: Record<string, string> }[] = pkg.spine?.[0]?.itemref ?? []
  const spine: EpubSpineItem[] = []
  for (const ref of spineRefs) {
    const idref = ref.$?.idref
    const entry = idref ? manifest.get(idref) : undefined
    if (entry) spine.push(entry)
  }
  if (spine.length === 0) throw new Error('EPUB has no readable chapters')

  const title =
    firstText(pkg.metadata?.[0]?.['dc:title']) ??
    firstText(pkg.metadata?.[0]?.title) ??
    titleFallback

  const bookId = crypto.randomUUID()
  sessions.set(bookId, { zip, opfDir })
  return { bookId, title, spine }
}

const RESOURCE_MIME_TYPES: Record<string, string> = {
  '.xhtml': XHTML_MIME,
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

/**
 * Wires the scheme up to serve chapter/resource content from an
 * already-opened session — call once after app ready. The host is the
 * opaque bookId itself (not a filesystem path needing the fixed-host
 * workaround mediaProtocol.ts needs): sessions only ever come from
 * openEpub, which already went through resolveUnderRoot, so there's no
 * separate re-confinement step here — an unknown/expired bookId just 404s,
 * and a session can only ever serve entries that exist inside its own zip.
 */
export function registerEpubProtocol(): void {
  protocol.handle(EPUB_SCHEME, async (request) => {
    const url = new URL(request.url)
    const session = sessions.get(url.hostname)
    if (!session) return new Response('not found', { status: 404 })

    const entryPath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const entry = session.zip.getEntry(entryPath)
    if (!entry) return new Response('not found', { status: 404 })

    const contentType = RESOURCE_MIME_TYPES[path.extname(entryPath).toLowerCase()] ?? 'application/octet-stream'
    return new Response(new Uint8Array(entry.getData()), { headers: { 'content-type': contentType } })
  })
}

export function toEpubUrl(bookId: string, entryHref: string): string {
  return `${EPUB_SCHEME}://${bookId}/${entryHref}`
}
