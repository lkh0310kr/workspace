import type { EditorDocumentSession, EditorSyncPhase, EditorTreeItem } from '@workspace/editor'
import type { GoogleDriveWorkspaceEntry } from '@pkms/google-drive'

export function createGoogleDriveDocumentSession(
  rootId: string,
  file: GoogleDriveWorkspaceEntry,
  initialText: string,
  initialRevision: string
): EditorDocumentSession {
  const providerId = `pkms-google-drive:${rootId}`
  let item: EditorTreeItem = {
    providerId,
    itemId: file.id,
    parentId: file.parents?.[0] ?? null,
    name: file.name,
    path: file.path,
    kind: 'markdown',
    readOnly: false
  }
  const listeners = new Set<(snapshot: ReturnType<EditorDocumentSession['snapshot']>) => void>()
  let content = initialText
  let revision = initialRevision
  let phase: 'clean' | 'dirty' | 'saving' | 'conflict' | 'error' = 'clean'
  let syncPhase: EditorSyncPhase = 'synced'
  let localRevision = 0
  let closed = false
  let message: string | undefined
  let deferredSyncTimer: number | undefined
  let autoSaveTimer: number | undefined
  let saveTail: Promise<void> = Promise.resolve()
  const snapshot = (): ReturnType<EditorDocumentSession['snapshot']> => ({
    content: { type: 'text' as const, text: content },
    revision,
    savePhase: phase,
    syncPhase,
    ...(message ? { message } : {})
  })
  const emit = (): void => {
    const current = snapshot()
    listeners.forEach((listener) => listener(current))
  }

  const save = (
    options: { flushSync?: boolean } = {}
  ): Promise<ReturnType<EditorDocumentSession['snapshot']>> => {
    if (autoSaveTimer !== undefined) {
      window.clearTimeout(autoSaveTimer)
      autoSaveTimer = undefined
    }
    const operation = saveTail.then(async () => {
      if (closed) throw new Error('Document session is closed')
      const requestedRevision = localRevision
      phase = 'saving'
      syncPhase = 'pending'
      message = undefined
      emit()
      try {
        const flushSync = options.flushSync !== false
        if (flushSync && deferredSyncTimer) {
          window.clearTimeout(deferredSyncTimer)
          deferredSyncTimer = undefined
        }
        const result = await window.pkmsDesktop.saveGoogleDriveMarkdown(
          rootId,
          file.id,
          content,
          flushSync
        )
        revision = result.revision
        phase = localRevision === requestedRevision ? 'clean' : 'dirty'
        syncPhase = result.sync.pendingOperations ? 'pending' : 'synced'
        if (!flushSync) {
          if (deferredSyncTimer) window.clearTimeout(deferredSyncTimer)
          deferredSyncTimer = window.setTimeout(() => {
            deferredSyncTimer = undefined
            void window.pkmsDesktop
              .syncGoogleDriveWorkspace(rootId)
              .then((sync) => {
                syncPhase = sync.pendingOperations ? 'pending' : 'synced'
                if (syncPhase === 'synced' && localRevision === requestedRevision) phase = 'clean'
                message = undefined
              })
              .catch((cause) => {
                syncPhase = 'blocked'
                message = cause instanceof Error ? cause.message : 'Google Drive sync failed.'
              })
              .finally(emit)
          }, 1_250)
        }
      } catch (cause) {
        phase = 'error'
        syncPhase = 'blocked'
        message = cause instanceof Error ? cause.message : 'Google Drive sync failed.'
      }
      emit()
      return snapshot()
    })
    saveTail = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  return {
    get item() {
      return item
    },
    readOnly: false,
    updateItem(next) {
      if (next.providerId === item.providerId && next.itemId === item.itemId) item = next
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => listeners.delete(listener)
    },
    async replaceText(nextText, baseRevision) {
      if (closed) throw new Error('Document session is closed')
      if (baseRevision !== revision) {
        phase = 'conflict'
        syncPhase = 'blocked'
        message = 'The document changed while this edit was being applied.'
        emit()
        throw new Error(message)
      }
      if (nextText === content) return
      content = nextText
      localRevision += 1
      revision = `${revision}:${localRevision}`
      phase = 'dirty'
      syncPhase = 'pending'
      message = undefined
      emit()
      // Persist edits automatically while batching Drive sync away from each keystroke.
      if (autoSaveTimer !== undefined) window.clearTimeout(autoSaveTimer)
      autoSaveTimer = window.setTimeout(() => {
        autoSaveTimer = undefined
        void save({ flushSync: false })
      }, 500)
    },
    save,
    async close() {
      if (autoSaveTimer !== undefined) {
        window.clearTimeout(autoSaveTimer)
        autoSaveTimer = undefined
      }
      if (phase === 'conflict')
        throw new Error(
          message ?? 'The document changed elsewhere. Resolve the conflict before closing it.'
        )
      if (
        phase === 'dirty' ||
        phase === 'saving' ||
        phase === 'error' ||
        deferredSyncTimer !== undefined
      ) {
        // The native outbox is durable before this resolves; Drive upload can continue after close.
        const saved = await save({ flushSync: false })
        if (saved.savePhase !== 'clean')
          throw new Error(saved.message ?? 'Could not save the document before closing it.')
      }
      closed = true
      listeners.clear()
    }
  }
}
