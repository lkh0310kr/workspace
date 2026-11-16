import { describe, expect, it, vi } from 'vitest'
import { createPkmsEditorProvider } from '../../../../../../packages/pkms-client/src/features/editor/pkmsEditorProvider'
import type { FileRecord } from '../../../../../../packages/pkms-client/src/domain/types'

const file = (id: string, path: string, kind: FileRecord['kind']): FileRecord => ({
  id,
  path,
  kind,
  revision: 1
})

describe('PKMS Editor name search', () => {
  it('searches unloaded nested folders and refreshes its index after tree changes', async () => {
    const directories = new Map<string, FileRecord[]>([
      ['', [file('folder', 'Verification', 'folder')]],
      [
        'Verification',
        [
          file('nested', 'Verification/Nested', 'folder'),
          file('loaded', 'Verification/Loaded.md', 'markdown')
        ]
      ],
      ['Verification/Nested', [file('deep', 'Verification/Nested/Deep Note.md', 'markdown')]]
    ])
    let notifyTree: ((paths: readonly string[]) => void) | undefined
    const listDirectory = vi.fn(async (path: string) => directories.get(path) ?? [])
    const provider = createPkmsEditorProvider({
      workspaceId: 'search-test',
      listDirectory,
      getFile: async () => null,
      openSession: async () => {
        throw new Error('not used by name search')
      },
      subscribeTree: (listener) => {
        notifyTree = listener
        return () => undefined
      },
      listLoadedFiles: () => [],
      searchContent: async () => ({
        results: [],
        indexedFiles: 0,
        searchableFiles: 0,
        pendingFiles: 0,
        hasMore: false,
        nextPath: null
      })
    })
    const options = {
      target: 'names' as const,
      caseSensitive: false,
      regex: false,
      wholeWord: false,
      fuzzy: true
    }

    const first = await provider.search('Deep Note', options)
    expect(first.map(({ item }) => item.path)).toEqual([
      'Verification/Nested/Deep Note.md'
    ])
    expect(listDirectory).toHaveBeenCalledTimes(3)

    provider.subscribeTree(() => undefined)
    directories.set('Verification/Nested', [file('new', 'Verification/Nested/New Note.md', 'markdown')])
    notifyTree?.(['Verification/Nested'])
    const second = await provider.search('New Note', options)
    expect(second.map(({ item }) => item.path)).toEqual([
      'Verification/Nested/New Note.md'
    ])
    expect(listDirectory).toHaveBeenCalledTimes(6)
  })
})
