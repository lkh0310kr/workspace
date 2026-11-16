import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleDriveWorkspaceEntry } from '@pkms/google-drive'
import type { EditorDocumentSession } from '@workspace/editor'
import { createGoogleDriveDocumentSession } from './PkmsGoogleDriveDocumentSession'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createHarness(): {
  session: EditorDocumentSession
  saveGoogleDriveMarkdown: ReturnType<typeof vi.fn>
  syncGoogleDriveWorkspace: ReturnType<typeof vi.fn>
} {
  const saveGoogleDriveMarkdown = vi.fn(async (_rootId: string, _fileId: string, text: string) => ({
    revision: `saved:${text}`,
    sync: { pendingOperations: 1 }
  }))
  const syncGoogleDriveWorkspace = vi.fn(async () => ({ pendingOperations: 0 }))
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    pkmsDesktop: { saveGoogleDriveMarkdown, syncGoogleDriveWorkspace }
  })
  const file = {
    id: 'file-1',
    name: 'note.md',
    path: 'note.md',
    kind: 'markdown',
    parents: []
  } as unknown as GoogleDriveWorkspaceEntry
  const session = createGoogleDriveDocumentSession('root-1', file, 'initial', 'rev-0')
  return { session, saveGoogleDriveMarkdown, syncGoogleDriveWorkspace }
}

describe('Google Drive document session', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('autosaves edits after 500ms and keeps sync pending until the delayed sync completes', async () => {
    const { session, saveGoogleDriveMarkdown, syncGoogleDriveWorkspace } = createHarness()
    const initial = session.snapshot()
    expect(initial).toMatchObject({ revision: 'rev-0', savePhase: 'clean', syncPhase: 'synced' })
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)
    expect(listener).toHaveBeenCalledExactlyOnceWith(initial)
    unsubscribe()

    await session.replaceText('edited', initial.revision)
    expect(session.snapshot().savePhase).toBe('dirty')
    await vi.advanceTimersByTimeAsync(499)
    expect(saveGoogleDriveMarkdown).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(saveGoogleDriveMarkdown).toHaveBeenCalledOnce()
    expect(saveGoogleDriveMarkdown).toHaveBeenCalledWith('root-1', 'file-1', 'edited', false)
    expect(session.snapshot()).toMatchObject({
      revision: 'saved:edited',
      savePhase: 'clean',
      syncPhase: 'pending'
    })

    await vi.advanceTimersByTimeAsync(1_249)
    expect(syncGoogleDriveWorkspace).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    await Promise.resolve()
    expect(syncGoogleDriveWorkspace).toHaveBeenCalledOnce()
    expect(session.snapshot()).toMatchObject({ savePhase: 'clean', syncPhase: 'synced' })
  })

  it('rejects a stale base revision and treats replacing with the same text as a no-op', async () => {
    const { session, saveGoogleDriveMarkdown } = createHarness()
    const initial = session.snapshot()
    await session.replaceText('initial', initial.revision)
    expect(session.snapshot()).toEqual(initial)

    await expect(session.replaceText('edited', 'stale-revision')).rejects.toThrow(
      'The document changed while this edit was being applied.'
    )
    expect(session.snapshot()).toMatchObject({ savePhase: 'conflict', syncPhase: 'blocked' })
    expect(saveGoogleDriveMarkdown).not.toHaveBeenCalled()
    await expect(session.close()).rejects.toThrow(
      'The document changed while this edit was being applied.'
    )
  })

  it('serializes saves and leaves edits made during an in-flight save dirty', async () => {
    const { session, saveGoogleDriveMarkdown } = createHarness()
    const firstSave = deferred<{ revision: string; sync: { pendingOperations: number } }>()
    const secondSave = deferred<{ revision: string; sync: { pendingOperations: number } }>()
    saveGoogleDriveMarkdown.mockImplementationOnce(() => firstSave.promise)
    saveGoogleDriveMarkdown.mockImplementationOnce(() => secondSave.promise)
    const firstRevision = session.snapshot().revision
    await session.replaceText('first', firstRevision)
    const first = session.save()
    await Promise.resolve()
    expect(saveGoogleDriveMarkdown).toHaveBeenCalledOnce()

    const editRevision = session.snapshot().revision
    await session.replaceText('second', editRevision)
    const second = session.save()
    expect(saveGoogleDriveMarkdown).toHaveBeenCalledOnce()

    firstSave.resolve({ revision: 'server-rev-1', sync: { pendingOperations: 1 } })
    await first
    await Promise.resolve()
    await Promise.resolve()
    expect(saveGoogleDriveMarkdown).toHaveBeenCalledTimes(2)
    expect(saveGoogleDriveMarkdown.mock.calls[1]).toEqual(['root-1', 'file-1', 'second', true])
    expect(session.snapshot().savePhase).toBe('saving')
    secondSave.resolve({ revision: 'server-rev-2', sync: { pendingOperations: 1 } })
    await second
    expect(session.snapshot()).toMatchObject({
      revision: 'server-rev-2',
      savePhase: 'clean',
      syncPhase: 'pending'
    })
  })

  it('waits for a durable non-flushing save before closing a dirty session', async () => {
    const { session, saveGoogleDriveMarkdown } = createHarness()
    const save = deferred<{ revision: string; sync: { pendingOperations: number } }>()
    saveGoogleDriveMarkdown.mockImplementationOnce(() => save.promise)
    await session.replaceText('durable edit', session.snapshot().revision)

    let closed = false
    const closing = session.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(saveGoogleDriveMarkdown).toHaveBeenCalledOnce()
    expect(saveGoogleDriveMarkdown).toHaveBeenCalledWith('root-1', 'file-1', 'durable edit', false)
    expect(closed).toBe(false)

    save.resolve({ revision: 'durable-rev', sync: { pendingOperations: 1 } })
    await closing
    expect(closed).toBe(true)
    expect(session.snapshot()).toMatchObject({ revision: 'durable-rev', savePhase: 'clean' })
  })

  it('reports a failed durable save as error/blocked and refuses to close', async () => {
    const { session, saveGoogleDriveMarkdown } = createHarness()
    saveGoogleDriveMarkdown.mockRejectedValueOnce(new Error('disk unavailable'))
    await session.replaceText('edited', session.snapshot().revision)

    await expect(session.close()).rejects.toThrow('disk unavailable')
    expect(session.snapshot()).toMatchObject({
      savePhase: 'error',
      syncPhase: 'blocked',
      message: 'disk unavailable'
    })
  })

  it('keeps the save clean but marks sync blocked when the delayed sync fails', async () => {
    const { session, syncGoogleDriveWorkspace } = createHarness()
    syncGoogleDriveWorkspace.mockRejectedValueOnce(new Error('Drive offline'))
    await session.replaceText('edited', session.snapshot().revision)
    await session.save({ flushSync: false })
    await vi.advanceTimersByTimeAsync(1_250)

    expect(session.snapshot()).toMatchObject({
      savePhase: 'clean',
      syncPhase: 'blocked',
      message: 'Drive offline'
    })
  })

  it('does not mark a newer edit clean when an earlier save sync completes', async () => {
    const { session, syncGoogleDriveWorkspace } = createHarness()
    const initialRevision = session.snapshot().revision
    await session.replaceText('first edit', initialRevision)
    await session.save({ flushSync: false })

    await vi.advanceTimersByTimeAsync(1_000)
    await session.replaceText('newer edit', session.snapshot().revision)
    await vi.advanceTimersByTimeAsync(250)

    expect(syncGoogleDriveWorkspace).toHaveBeenCalledOnce()
    expect(session.snapshot()).toMatchObject({
      content: { text: 'newer edit' },
      savePhase: 'dirty',
      syncPhase: 'synced'
    })
  })
})
