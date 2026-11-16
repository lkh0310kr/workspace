import type { FileLocation } from './types'

export function fileLocationPath(workspaceId: string, path: string): string {
  return `/workspace/${encodeURIComponent(workspaceId)}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function parseFileLocation(pathname: string): FileLocation | null {
  if (!pathname.startsWith('/workspace/')) return null
  const segments = pathname.slice('/workspace/'.length).split('/')
  if (segments.length < 2 || !segments[0]) return null
  try {
    return {
      workspaceId: decodeURIComponent(segments[0]),
      path: segments.slice(1).map(decodeURIComponent).join('/')
    }
  } catch {
    return null
  }
}
