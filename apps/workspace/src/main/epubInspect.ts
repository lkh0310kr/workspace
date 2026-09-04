import * as path from 'node:path'
import type AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import type { EpubBook, EpubSpineItem } from './epubTypes'

const XHTML_MIME = 'application/xhtml+xml'

function firstText(node: unknown): string | undefined {
  if (Array.isArray(node)) return typeof node[0] === 'string' ? node[0] : undefined
  return typeof node === 'string' ? node : undefined
}

export async function inspectEpubZip(
  zip: AdmZip,
  titleFallback: string
): Promise<{ title: string; spine: EpubSpineItem[]; sizes: Record<string, number>; opfDir: string }> {
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

  const sizes: Record<string, number> = {}
  for (const zipEntry of zip.getEntries()) {
    if (zipEntry.isDirectory) continue
    const name = zipEntry.entryName.replace(/\\/g, '/')
    sizes[name] = Number(zipEntry.header?.size ?? 0)
  }

  return { title, spine, sizes, opfDir }
}

export type { EpubBook, EpubSpineItem }
