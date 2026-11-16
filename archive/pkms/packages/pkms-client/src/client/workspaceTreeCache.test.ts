import { describe, expect, it } from 'vitest'
import type { FileRecord } from '../domain/types'
import { replaceDirectoryEntries } from './workspaceTreeCache'

describe('replaceDirectoryEntries', () => {
  it('replaces one directory, removes descendants of removed folders, and keeps sibling branches', () => {
    const current: FileRecord[] = [
      { id: 'old-note', path: 'notes/old.md', kind: 'markdown', revision: 1 },
      { id: 'old-folder', path: 'notes/old-folder', kind: 'folder', revision: 1 },
      {
        id: 'nested-note',
        path: 'notes/old-folder/nested.md',
        kind: 'markdown',
        revision: 1
      },
      { id: 'sibling-folder', path: 'other', kind: 'folder', revision: 1 },
      { id: 'sibling-note', path: 'other/keep.md', kind: 'markdown', revision: 1 }
    ]
    const incoming: FileRecord[] = [
      { id: 'new-note', path: 'notes/new.md', kind: 'markdown', revision: 2 }
    ]

    const result = replaceDirectoryEntries(current, 'notes', incoming)

    expect(result).toEqual([current[3], current[4], incoming[0]])
  })

  it('returns the original array when the authoritative listing is unchanged', () => {
    const current: FileRecord[] = [
      { id: 'note', path: 'notes/keep.md', kind: 'markdown', revision: 1 }
    ]

    expect(replaceDirectoryEntries(current, 'notes', [{ ...current[0] }])).toBe(current)
  })
})
