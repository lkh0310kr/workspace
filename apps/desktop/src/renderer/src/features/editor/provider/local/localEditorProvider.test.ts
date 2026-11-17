/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorDocumentSession, EditorTreeItem } from '@workspace/editor'

const io = vi.hoisted(() => ({
  listDir: vi.fn(),
  readFile: vi.fn(),
  getMediaUrl: vi.fn(),
  writeFileIfUnchanged: vi.fn(),
  writeFile: vi.fn(),
  createDir: vi.fn(),
  deletePath: vi.fn(),
  renamePath: vi.fn(),
  onFileChanged: vi.fn(),
  onSearchResult: vi.fn(),
  onSearchDone: vi.fn(),
  searchInFiles: vi.fn(),
  cancelSearch: vi.fn(),
  changed: null as ((paths: string[]) => void) | null,
  unsubscribe: vi.fn()
}))

vi.mock('./localFileSystem', () => ({
  listDir: io.listDir,
  readFile: io.readFile,
  getMediaUrl: io.getMediaUrl,
  writeFileIfUnchanged: io.writeFileIfUnchanged,
  writeFile: io.writeFile,
  createDir: io.createDir,
  deletePath: io.deletePath,
  renamePath: io.renamePath,
  onFileChanged: (handler: (paths: string[]) => void) => {
    io.changed = handler
    io.onFileChanged(handler)
    return io.unsubscribe
  },
  onSearchResult: io.onSearchResult,
  onSearchDone: io.onSearchDone,
  searchInFiles: io.searchInFiles,
  cancelSearch: io.cancelSearch
}))
vi.mock('../../viewers/host/editorIpc', () => ({ getMediaUrl: io.getMediaUrl }))

import { acquireLocalEditorProvider } from './localEditorProvider'

const fileKey = (tabId: number, path: string): string => `${tabId}:${path}`

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

type SearchFileUpdate = {
  path: string
  matches: Array<{
    lineNumber: number
    lineText: string
    ranges: Array<{ start: number; end: number }>
  }>
}
type SearchResultListener = (requestId: string, result: SearchFileUpdate) => void
type SearchDoneListener = (requestId: string, error?: string) => void

function mockContentSearchResult(matches: SearchFileUpdate['matches']): void {
  let onResult: SearchResultListener | undefined
  let onDone: SearchDoneListener | undefined
  io.onSearchResult.mockImplementation((listener: SearchResultListener) => {
    onResult = listener
    return vi.fn()
  })
  io.onSearchDone.mockImplementation((listener: SearchDoneListener) => {
    onDone = listener
    return vi.fn()
  })
  io.searchInFiles.mockImplementation((requestId: string) => {
    onResult?.(requestId, { path: 'notes/a.md', matches })
    onDone?.(requestId)
  })
}

describe('local editor document sessions', () => {
  const disk = new Map<string, string>()
  let release: (() => void) | undefined

  beforeEach(() => {
    disk.clear()
    localStorage.clear()
    io.listDir.mockReset()
    io.readFile.mockReset()
    io.getMediaUrl.mockReset()
    io.writeFileIfUnchanged.mockReset()
    io.writeFile.mockReset()
    io.createDir.mockReset()
    io.deletePath.mockReset()
    io.renamePath.mockReset()
    io.onFileChanged.mockReset()
    io.onSearchResult.mockReset()
    io.onSearchDone.mockReset()
    io.searchInFiles.mockReset()
    io.cancelSearch.mockReset()
    io.unsubscribe.mockReset()
    io.changed = null

    io.listDir.mockImplementation(async (_tabId: number, path: string) => {
      if (path === '') {
        return [
          { name: 'notes', path: 'notes', is_dir: true },
          { name: 'image.png', path: 'image.png', is_dir: false }
        ]
      }
      if (path === 'notes') return [{ name: 'a.md', path: 'notes/a.md', is_dir: false }]
      return []
    })
    io.readFile.mockImplementation(
      async (tabId: number, path: string) => disk.get(fileKey(tabId, path)) ?? null
    )
    io.getMediaUrl.mockResolvedValue('blob:preview')
    io.writeFileIfUnchanged.mockImplementation(
      async (tabId: number, path: string, expected: string, content: string) => {
        const key = fileKey(tabId, path)
        if (disk.get(key) !== expected) return false
        disk.set(key, content)
        return true
      }
    )
    io.renamePath.mockImplementation(async (tabId: number, from: string, to: string) => {
      for (const [key, value] of [...disk]) {
        const prefix = `${tabId}:`
        if (!key.startsWith(prefix)) continue
        const path = key.slice(prefix.length)
        if (path === from || path.startsWith(`${from}/`)) {
          disk.delete(key)
          disk.set(fileKey(tabId, `${to}${path.slice(from.length)}`), value)
        }
      }
    })
    io.onFileChanged.mockImplementation(() => undefined)
    io.unsubscribe.mockImplementation(() => undefined)
  })

  afterEach(async () => {
    release?.()
    release = undefined
    await Promise.resolve()
  })

  async function openMarkdown(initialContent = 'A'): Promise<{
    lease: ReturnType<typeof acquireLocalEditorProvider>
    note: EditorTreeItem
    session: EditorDocumentSession
  }> {
    disk.set(fileKey(7, 'notes/a.md'), initialContent)
    const lease = acquireLocalEditorProvider(7, '/workspace-a')
    release = lease.release
    const rootItems = await lease.provider.listChildren(null)
    const notes = rootItems.find((item) => item.path === 'notes')
    if (!notes) throw new Error('notes directory was not listed')
    const noteItems = await lease.provider.listChildren(notes.itemId)
    const note = noteItems.find((item) => item.path === 'notes/a.md')
    if (!note) throw new Error('markdown file was not listed')
    const session = await lease.provider.openDocument(note)
    return { lease, note, session }
  }

  it('loads text with a fresh revision and rejects edits based on a stale revision', async () => {
    const { note, session } = await openMarkdown()
    const initial = session.snapshot()

    expect(note.kind).toBe('markdown')
    expect(initial.content).toEqual({ type: 'text', text: 'A' })
    expect(initial.savePhase).toBe('clean')
    expect(initial.revision).not.toBe('0')

    await expect(session.replaceText('B', 'stale')).rejects.toMatchObject({ code: 'conflict' })
    expect(session.snapshot()).toMatchObject({
      content: { type: 'text', text: 'A' },
      savePhase: 'conflict'
    })
    expect(io.writeFileIfUnchanged).not.toHaveBeenCalled()

    await session.close()
    await expect(session.replaceText('B', initial.revision)).rejects.toMatchObject({
      code: 'notFound'
    })
  })

  it('keeps edits made during a save dirty and ignores the save’s own watcher event', async () => {
    const { session } = await openMarkdown()
    const initial = session.snapshot()
    await session.replaceText('B', initial.revision)

    const pendingWrite = deferred<boolean>()
    io.writeFileIfUnchanged.mockReturnValueOnce(pendingWrite.promise)
    const saving = session.save()
    expect(session.snapshot().savePhase).toBe('saving')

    await session.replaceText('C', initial.revision)
    disk.set(fileKey(7, 'notes/a.md'), 'B')
    io.changed?.(['notes/a.md'])
    await Promise.resolve()

    pendingWrite.resolve(true)
    expect(await saving).toMatchObject({
      content: { type: 'text', text: 'C' },
      savePhase: 'dirty'
    })

    const nextSnapshot = session.snapshot()
    const clean = await session.save()
    expect(io.writeFileIfUnchanged).toHaveBeenNthCalledWith(
      1,
      7,
      'notes/a.md',
      'A',
      'B',
      '/workspace-a'
    )
    expect(io.writeFileIfUnchanged).toHaveBeenNthCalledWith(
      2,
      7,
      'notes/a.md',
      'B',
      'C',
      '/workspace-a'
    )
    expect(clean).toMatchObject({ content: { type: 'text', text: 'C' }, savePhase: 'clean' })
    expect(clean.revision).not.toBe(nextSnapshot.revision)
  })

  it('preserves external disk content when a conditional save detects a conflict', async () => {
    const { session } = await openMarkdown()
    const initial = session.snapshot()
    await session.replaceText('local', initial.revision)
    disk.set(fileKey(7, 'notes/a.md'), 'external')

    await expect(session.save()).rejects.toMatchObject({ code: 'conflict' })
    expect(disk.get(fileKey(7, 'notes/a.md'))).toBe('external')
    expect(session.snapshot()).toMatchObject({
      content: { type: 'text', text: 'local' },
      savePhase: 'conflict'
    })
  })

  it('ignores watcher reads rejected after the tab root switches', async () => {
    const { session } = await openMarkdown('root A content')
    io.readFile.mockRejectedValueOnce(
      new Error('Workspace root changed; retry the operation in the current workspace.')
    )

    io.changed?.(['notes/a.md'])
    await vi.waitFor(() => expect(io.readFile).toHaveBeenCalledTimes(2))
    await Promise.resolve()

    expect(io.readFile).toHaveBeenLastCalledWith(7, 'notes/a.md', '/workspace-a')
    expect(session.snapshot()).toMatchObject({
      content: { type: 'text', text: 'root A content' },
      savePhase: 'clean'
    })
  })

  it('reloads clean external changes, but turns dirty external changes into a conflict', async () => {
    const { session } = await openMarkdown()
    const initial = session.snapshot()

    disk.set(fileKey(7, 'notes/a.md'), 'external clean')
    io.changed?.(['notes/a.md'])
    await vi.waitFor(() =>
      expect(session.snapshot().content).toEqual({ type: 'text', text: 'external clean' })
    )
    const refreshed = session.snapshot()
    expect(refreshed.savePhase).toBe('clean')
    expect(refreshed.revision).not.toBe(initial.revision)

    await session.replaceText('local dirty', refreshed.revision)
    disk.set(fileKey(7, 'notes/a.md'), 'external dirty')
    io.changed?.(['notes/a.md'])
    await vi.waitFor(() => expect(session.snapshot().savePhase).toBe('conflict'))
    expect(session.snapshot().content).toEqual({ type: 'text', text: 'local dirty' })
  })

  it('updates an open session after rename and does not save on close', async () => {
    const { lease, note, session } = await openMarkdown()
    const initial = session.snapshot()

    await lease.provider.rename?.(note, 'renamed.md')
    expect(io.renamePath).toHaveBeenCalledWith(7, 'notes/a.md', 'notes/renamed.md', '/workspace-a')
    expect(session.item).toMatchObject({ path: 'notes/renamed.md', name: 'renamed.md' })

    await session.replaceText('B', initial.revision)
    await session.close()
    expect(io.writeFileIfUnchanged).not.toHaveBeenCalled()
    expect(io.unsubscribe).not.toHaveBeenCalled()
    release?.()
    release = undefined
    expect(io.unsubscribe).toHaveBeenCalledOnce()
  })

  it('loads assets as read-only previews', async () => {
    const lease = acquireLocalEditorProvider(8, '/workspace')
    release = lease.release
    const rootItems = await lease.provider.listChildren(null)
    const image = rootItems.find((item) => item.path === 'image.png')
    if (!image) throw new Error('image file was not listed')
    const session = await lease.provider.openDocument(image)

    expect(session.readOnly).toBe(true)
    expect(session.snapshot().content).toEqual({
      type: 'asset',
      previewUrl: 'blob:preview',
      mediaType: 'image/png'
    })
    await expect(session.replaceText('text', session.snapshot().revision)).rejects.toMatchObject({
      code: 'readOnly'
    })
  })

  it('cancels content search and removes both IPC listeners on abort', async () => {
    const lease = acquireLocalEditorProvider(7, '/workspace')
    release = lease.release
    const offResult = vi.fn()
    const offDone = vi.fn()
    io.onSearchResult.mockImplementation(() => offResult)
    io.onSearchDone.mockImplementation(() => offDone)
    io.searchInFiles.mockImplementation(() => undefined)
    const controller = new AbortController()

    const search = lease.provider.search(
      'needle',
      { target: 'contents', caseSensitive: false, regex: false, wholeWord: false },
      controller.signal
    )
    const requestId = io.searchInFiles.mock.calls[0][0]
    controller.abort()

    await expect(search).rejects.toBeDefined()
    expect(io.cancelSearch).toHaveBeenCalledWith(requestId)
    expect(offResult).toHaveBeenCalledOnce()
    expect(offDone).toHaveBeenCalledOnce()
  })

  it('does not replace when the current disk match count differs from the search result', async () => {
    const { lease, note } = await openMarkdown('needle')
    mockContentSearchResult([{ lineNumber: 1, lineText: 'needle', ranges: [{ start: 0, end: 6 }] }])
    const [searchResult] = await lease.provider.search('needle', {
      target: 'contents',
      caseSensitive: false,
      regex: false,
      wholeWord: false
    })
    expect(searchResult.item.itemId).toBe(note.itemId)

    disk.set(fileKey(7, 'notes/a.md'), 'needle needle')
    const replaced = await lease.provider.replaceContents?.(
      { providerId: note.providerId, itemId: note.itemId },
      'needle',
      'replacement',
      { caseSensitive: false, regex: false, wholeWord: false },
      1
    )

    expect(replaced).toBe(false)
    expect(disk.get(fileKey(7, 'notes/a.md'))).toBe('needle needle')
    expect(io.writeFileIfUnchanged).not.toHaveBeenCalled()
  })

  it('does not replace a search result while its document session is dirty', async () => {
    const { lease, note, session } = await openMarkdown('needle')
    mockContentSearchResult([{ lineNumber: 1, lineText: 'needle', ranges: [{ start: 0, end: 6 }] }])
    await lease.provider.search('needle', {
      target: 'contents',
      caseSensitive: false,
      regex: false,
      wholeWord: false
    })
    await session.replaceText('unsaved edit', session.snapshot().revision)

    const replaced = await lease.provider.replaceContents?.(
      { providerId: note.providerId, itemId: note.itemId },
      'needle',
      'replacement',
      { caseSensitive: false, regex: false, wholeWord: false },
      1
    )

    expect(replaced).toBe(false)
    expect(disk.get(fileKey(7, 'notes/a.md'))).toBe('needle')
    expect(io.writeFileIfUnchanged).not.toHaveBeenCalled()
  })

  it('keeps provider identity and cached item IDs separate across roots of one tab', () => {
    const first = acquireLocalEditorProvider(7, '/workspace-a')
    const second = acquireLocalEditorProvider(7, '/workspace-b')
    release = () => {
      first.release()
      second.release()
    }

    expect(second.provider).not.toBe(first.provider)
    expect(second.provider.id).not.toBe(first.provider.id)
  })
})
