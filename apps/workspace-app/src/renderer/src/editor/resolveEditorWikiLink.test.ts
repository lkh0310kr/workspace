import { describe, expect, it, vi } from 'vitest'
import { resolveEditorWikiLink, type EditorTreeItem } from '@workspace/editor'

function item(
  itemId: string,
  name: string,
  path: string,
  kind: EditorTreeItem['kind'],
  parentId: string | null = null
): EditorTreeItem {
  return {
    providerId: 'wiki-test',
    itemId,
    parentId,
    name,
    path,
    kind,
    readOnly: false
  }
}

describe('resolveEditorWikiLink', () => {
  it('finds an existing note recursively without creating a duplicate', async () => {
    const folder = item('folder', 'Notes', 'Notes', 'directory')
    const target = item('readme', 'Readme.md', 'Notes/Readme.md', 'markdown', folder.itemId)
    const listChildren = vi.fn(async (parentId: string | null) =>
      parentId === null ? [folder] : parentId === folder.itemId ? [target] : []
    )
    const createFileAtRoot = vi.fn(async (name: string) => item('new', name, name, 'markdown'))

    await expect(
      resolveEditorWikiLink({ listChildren, createFileAtRoot }, 'notes/Readme')
    ).resolves.toEqual(target)
    expect(createFileAtRoot).not.toHaveBeenCalled()
  })

  it('preserves the wikilink name when creating a missing root note', async () => {
    const createFileAtRoot = vi.fn(async (name: string) => item('new', name, name, 'markdown'))

    await expect(
      resolveEditorWikiLink({ listChildren: async () => [], createFileAtRoot }, 'Release Notes')
    ).resolves.toMatchObject({ name: 'Release Notes.md', path: 'Release Notes.md' })
    expect(createFileAtRoot).toHaveBeenCalledWith('Release Notes.md')
  })
})
