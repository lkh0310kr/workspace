import type { EditorProvider, EditorTreeItem } from './provider'
import { EditorProviderError } from './provider'

/** Resolve a provider-relative path through its lazy tree without using host filesystem APIs. */
export async function resolveEditorTreePath(
  provider: Pick<EditorProvider, 'listChildren'>,
  path: string,
  signal?: AbortSignal
): Promise<EditorTreeItem | null> {
  if (!path || path.startsWith('/')) return null
  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  let parentId: string | null = null
  let found: EditorTreeItem | undefined
  for (const [index, segment] of segments.entries()) {
    const children = await provider.listChildren(parentId, signal)
    found = children.find((child) => child.name === segment)
    if (!found) return null
    if (index < segments.length - 1) {
      if (found.kind !== 'directory') return null
      parentId = found.itemId
    }
  }
  return found ?? null
}

/** Resolve a provider directory path, returning null only for the provider root. */
export async function resolveEditorTreeDirectory(
  provider: Pick<EditorProvider, 'listChildren'>,
  path: string,
  message = 'Directory no longer exists',
  signal?: AbortSignal
): Promise<EditorTreeItem | null> {
  if (!path) return null
  const item = await resolveEditorTreePath(provider, path, signal)
  if (!item || item.kind !== 'directory') throw new EditorProviderError('notFound', message)
  return item
}
