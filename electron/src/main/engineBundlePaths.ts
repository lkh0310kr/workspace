import * as fs from 'node:fs'
import * as path from 'node:path'

// Pure logic for engineBundleProtocol.ts, split into its own file with no
// `electron` import so it's unit-testable under plain vitest — same
// reason mediaRange.ts exists separately from mediaProtocol.ts.

export const ENGINE_SCHEME = 'workspace-engine'
export const ENGINE_HOST = 'local'

/** `absoluteBundleDir` is the directory an engine's export produced
 * (containing index.html + its .js/.wasm/.pck siblings) — resolve it via
 * files.resolveUnderRoot the same way mediaUrl() does, never from an
 * unconfined renderer-supplied path directly. */
export function toEngineBundleUrl(absoluteBundleDir: string, entry = 'index.html'): string {
  const encodedDir = absoluteBundleDir
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${ENGINE_SCHEME}://${ENGINE_HOST}${encodedDir}/${encodeURIComponent(entry)}`
}

// Godot's Web export is the concrete first target (see docs/ideation.md),
// so .wasm/.pck get named treatment; the rest is a generic static-file
// set any future Web-exportable engine would also need. .wasm's MIME
// matters for real: Chromium's streaming WebAssembly.instantiateStreaming
// requires `application/wasm` exactly, falling back to a slower
// buffer-then-compile path otherwise.
export const ENGINE_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.pck': 'application/octet-stream', // Godot's binary data pack — no registered MIME
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain'
}

export function contentTypeFor(filePath: string): string {
  return ENGINE_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/** Pure path-confinement check — same realpath-prefix shape
 * mediaProtocol.ts's inline version uses, split out here so it's
 * unit-testable without Electron's `protocol` API. */
export function isPathConfined(realPath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => {
    try {
      const realRoot = fs.realpathSync(root)
      return realPath === realRoot || realPath.startsWith(realRoot + path.sep)
    } catch {
      return false
    }
  })
}
