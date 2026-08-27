import { protocol } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Why: a page not loaded from file:// itself (Vite dev server's
// http://localhost, and possibly the packaged build depending on how it's
// loaded) gets "Not allowed to load local resource" from Chromium when an
// <img>/<embed> src points at a raw file:// URL — a hard content-layer
// restriction, not something a CSP directive can override. Serving local
// files through our own registered scheme instead sidesteps that
// restriction regardless of the page's own origin, which is the pattern
// Electron's own docs recommend for exactly this case.
export const LOCAL_FILE_SCHEME = 'workspace-file'

export function toLocalFileUrl(absolutePath: string): string {
  return pathToFileURL(absolutePath).toString().replace(/^file:/, `${LOCAL_FILE_SCHEME}:`)
}

// Must run before app 'ready' — Chromium reads privileged-scheme
// registration once at startup. Runs at module import time (index.ts
// imports this before app.whenReady()).
protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_FILE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf'
}

/**
 * Wires the scheme up to actually serve files — call once after app ready.
 * `getAllowedRoots` re-confines every request to a currently-open workspace
 * tab's root, the same guarantee files.ts's resolveUnderRoot gives IPC
 * callers: toLocalFileUrl is only ever produced from an already-confined
 * path, but the scheme itself is otherwise global, so re-checking here
 * means a crafted workspace-file:// URL from anywhere else in the renderer
 * still can't read arbitrary paths off disk.
 */
export function registerLocalFileProtocol(getAllowedRoots: () => string[]): void {
  protocol.handle(LOCAL_FILE_SCHEME, async (request) => {
    let absolutePath: string
    try {
      absolutePath = fileURLToPath(request.url.replace(/^workspace-file:/, 'file:'))
    } catch {
      return new Response('bad request', { status: 400 })
    }

    let realPath: string
    try {
      realPath = fs.realpathSync(absolutePath)
    } catch {
      return new Response('not found', { status: 404 })
    }

    const confined = getAllowedRoots().some((root) => {
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

    const contentType = MIME_TYPES[path.extname(realPath).toLowerCase()]
    if (!contentType) {
      return new Response('unsupported type', { status: 415 })
    }

    try {
      return new Response(fs.readFileSync(realPath), { headers: { 'content-type': contentType } })
    } catch {
      return new Response('read error', { status: 500 })
    }
  })
}
