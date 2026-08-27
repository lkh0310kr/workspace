import { protocol } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { parseRangeHeader } from './mediaRange'

// Streaming video/audio protocol — NOT a general file-serving scheme like
// the abandoned localFileProtocol.ts (removed in d71ce0c/dca0582/d71ce0c's
// follow-up, git show 4d8d898 for the full source). That one was dropped
// for images/PDF because blob: URLs (base64 over IPC) are simpler for
// small whole-file content. Video/audio can't use that approach at all:
// loading a multi-GB file into memory as base64 is a 4-5x memory blowup
// through the IPC-copy/atob chain, main-process readFileSync blocks
// synchronously, and there's no way to seek without loading the whole
// file first. This recovers 4d8d898's fixed-host URL construction
// near-verbatim (that exact bug — an empty authority letting Chromium
// swallow the path's first segment as hostname — must not come back) and
// adds HTTP Range support, which <video>/<audio> issue automatically on
// seek.
export const MEDIA_SCHEME = 'workspace-media'

// Why a fixed dummy host instead of an empty authority
// (workspace-media:///Users/...): file: is the one scheme the URL Standard
// special-cases to allow an empty host before an absolute path. A custom
// "standard" scheme doesn't get that carve-out — Chromium's parser instead
// swallows the path's first segment as the hostname (and lowercases it).
// Anchoring on a fixed, never-ambiguous host keeps the entire absolute
// path in `.pathname`, which the parser leaves case- and structure-intact.
const MEDIA_HOST = 'local'

// Why a second host instead of reusing MEDIA_HOST for browsed files too:
// the host itself is the trust signal the protocol handler switches on —
// 'local' means "confine to an open workspace root", 'browsed' means "the
// user explicitly picked this via the native Browse dialog, skip that
// check". Using a distinct host keeps that decision explicit in the URL
// rather than threading a second boolean through toMediaUrl's one caller
// path.
const MEDIA_HOST_BROWSED = 'browsed'

function buildMediaUrl(host: string, absolutePath: string): string {
  const encodedPath = absolutePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${MEDIA_SCHEME}://${host}${encodedPath}`
}

export function toMediaUrl(absolutePath: string): string {
  return buildMediaUrl(MEDIA_HOST, absolutePath)
}

/** For a file picked via the native Browse dialog (dialog:pick-media-file)
 * — deliberately NOT confined to any workspace root. The dialog itself is
 * the trust boundary: this is only ever called with a path the OS-level
 * picker returned to the main process, never a renderer-supplied string. */
export function toMediaUrlBrowsed(absolutePath: string): string {
  return buildMediaUrl(MEDIA_HOST_BROWSED, absolutePath)
}

// Must run before app 'ready' — Chromium reads privileged-scheme
// registration once at startup. Runs at module import time (index.ts
// imports this before app.whenReady()).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

export const MEDIA_MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac'
}

/**
 * Wires the scheme up to actually serve files — call once after app ready
 * (and after `workspace` is constructed, since `getAllowedRoots` reads its
 * live tab roots). Re-confines every request to a currently-open
 * workspace tab's root: toMediaUrl is only ever produced from an
 * already-confined path, but the scheme itself is otherwise global, so a
 * crafted workspace-media:// URL from anywhere else in the renderer still
 * can't read arbitrary paths off disk.
 */
export function registerMediaProtocol(getAllowedRoots: () => string[]): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let absolutePath: string
    let browsed: boolean
    try {
      const url = new URL(request.url)
      if (url.hostname === MEDIA_HOST) {
        browsed = false
      } else if (url.hostname === MEDIA_HOST_BROWSED) {
        browsed = true
      } else {
        return new Response('bad request', { status: 400 })
      }
      absolutePath = decodeURIComponent(url.pathname)
    } catch {
      return new Response('bad request', { status: 400 })
    }

    let realPath: string
    try {
      realPath = fs.realpathSync(absolutePath)
    } catch {
      return new Response('not found', { status: 404 })
    }

    const confined =
      browsed ||
      getAllowedRoots().some((root) => {
        try {
          const realRoot = fs.realpathSync(root)
          return realPath === realRoot || realPath.startsWith(realRoot + path.sep)
        } catch {
          return false
        }
      })
    if (!confined) {
      return new Response('forbidden', { status: 403 })
    }

    const contentType = MEDIA_MIME_TYPES[path.extname(realPath).toLowerCase()]
    if (!contentType) {
      return new Response('unsupported type', { status: 415 })
    }

    let size: number
    try {
      size = fs.statSync(realPath).size
    } catch {
      return new Response('read error', { status: 500 })
    }

    const slice = parseRangeHeader(request.headers.get('range'), size)
    const start = slice?.start ?? 0
    const end = slice?.end ?? size - 1
    const nodeStream = fs.createReadStream(realPath, { start, end })
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    if (slice) {
      return new Response(webStream, {
        status: 206,
        headers: {
          'content-type': contentType,
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': String(end - start + 1),
          'accept-ranges': 'bytes'
        }
      })
    }
    return new Response(webStream, {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-length': String(size),
        'accept-ranges': 'bytes'
      }
    })
  })
}
