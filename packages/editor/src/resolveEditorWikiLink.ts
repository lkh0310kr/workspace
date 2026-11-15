import type { EditorTreeItem } from './provider'
import { EditorProviderError } from './provider'

export interface EditorWikiLinkSource {
  listChildren(parentId: string | null): Promise<EditorTreeItem[]>
  createFileAtRoot?(name: string): Promise<EditorTreeItem>
}

/** Resolve a wikilink against lazy provider trees, creating the missing note at root. */
export async function resolveEditorWikiLink(
  source: EditorWikiLinkSource,
  target: string
): Promise<EditorTreeItem> {
  const base = target.split('/').pop()?.trim() ?? ''
  if (!base) throw new EditorProviderError('notFound', 'The wikilink has no note name')
  const name = base.toLocaleLowerCase().endsWith('.md') ? base : `${base}.md`
  const wanted = name.toLocaleLowerCase()
  const queue: Array<{ parentId: string | null }> = [{ parentId: null }]
  let visited = 0
  while (queue.length > 0 && visited < 500) {
    const { parentId } = queue.shift()!
    visited++
    const entries = await source.listChildren(parentId)
    for (const entry of entries) {
      if (entry.kind === 'directory') queue.push({ parentId: entry.itemId })
      else if (entry.kind === 'markdown' && entry.name.toLocaleLowerCase() === wanted) return entry
    }
  }
  if (!source.createFileAtRoot)
    throw new EditorProviderError('unsupported', 'Creating a note from a wikilink is unavailable')
  return source.createFileAtRoot(name)
}
