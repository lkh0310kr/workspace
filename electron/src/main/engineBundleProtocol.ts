import { protocol } from 'electron'
import * as fs from 'node:fs'
import { Readable } from 'node:stream'
import { ENGINE_SCHEME, ENGINE_HOST, contentTypeFor, isPathConfined } from './engineBundlePaths'

// Serves a directory of pre-built static engine-bundle files (a Web/
// HTML5 export from a forked engine — Godot first, see docs/architecture/
// 09-future-native-architecture.md and docs/ideation.md's Phase 2
// direction) to a renderer <webview>, the same pattern mediaProtocol.ts
// already uses for video/audio and epub.ts uses for EPUB resources. A
// *bundle* here is whatever an engine's own export tooling already
// produced on disk (e.g. `godot --export-release Web ...`) — this module
// never invokes any export tooling itself, only serves what's already
// there, confined to an open workspace tab's root the same way media
// files are. Path/MIME logic lives in engineBundlePaths.ts (no `electron`
// import there, so it's unit-testable) — this file is just the
// `protocol.handle` wiring, same split mediaRange.ts/mediaProtocol.ts use.
//
// Why a custom protocol.handle scheme instead of file:// or a real
// localhost HTTP server:
// (a) confinement — the same realpath-prefix check mediaProtocol.ts
//     already uses, so a crafted URL can't read arbitrary paths off disk.
// (b) response headers — a Web export built with threading support
//     needs `Cross-Origin-Opener-Policy: same-origin` +
//     `Cross-Origin-Embedder-Policy: require-corp` on every response to
//     unlock SharedArrayBuffer. Neither file:// nor Electron's default
//     handling sets these; protocol.handle's Response object can. Every
//     request here resolves to the same fixed origin
//     (`workspace-engine://local`), so COEP's "cross-origin subresources
//     need their own CORP header" requirement never actually triggers —
//     nothing served through this scheme is cross-origin to anything
//     else served through it.

// Same fixed-host trick as mediaProtocol.ts's MEDIA_HOST, same reason: a
// custom "standard" scheme doesn't get file:'s empty-authority carve-out
// for an absolute path, so Chromium's URL parser would otherwise swallow
// the path's first segment as the hostname.
protocol.registerSchemesAsPrivileged([
  {
    scheme: ENGINE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

/**
 * Wires the scheme up to actually serve files — call once after app
 * ready (and after `workspace` is constructed, since `getAllowedRoots`
 * reads its live tab roots), mirroring registerMediaProtocol's own
 * call-site convention in index.ts.
 */
export function registerEngineBundleProtocol(getAllowedRoots: () => string[]): void {
  protocol.handle(ENGINE_SCHEME, async (request) => {
    let absolutePath: string
    try {
      const url = new URL(request.url)
      if (url.hostname !== ENGINE_HOST) return new Response('bad request', { status: 400 })
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

    if (!isPathConfined(realPath, getAllowedRoots())) {
      return new Response('forbidden', { status: 403 })
    }

    let size: number
    try {
      size = fs.statSync(realPath).size
    } catch {
      return new Response('read error', { status: 500 })
    }

    const nodeStream = fs.createReadStream(realPath)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new Response(webStream, {
      status: 200,
      headers: {
        'content-type': contentTypeFor(realPath),
        'content-length': String(size),
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'require-corp'
      }
    })
  })
}
