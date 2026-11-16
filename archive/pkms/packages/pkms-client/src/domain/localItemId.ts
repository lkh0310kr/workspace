import { toBase64 } from './encoding'

/** Creates the stable path-based ID used for local folders that lack a loaded server ID. */
export function localItemIdForPath(path: string): string {
  return `local-${toBase64(new TextEncoder().encode(path))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')}`
}
