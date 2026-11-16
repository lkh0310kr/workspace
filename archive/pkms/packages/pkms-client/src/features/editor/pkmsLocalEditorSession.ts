import type {
  EditorDocumentSession,
  EditorDocumentSnapshot,
  EditorTreeItem
} from '@workspace/editor'
import { EditorProviderError } from '@workspace/editor'
import type { FileRecord } from '../../domain/types'
import { entryName } from '../../domain/fileTree'
import { desktopBridge } from '../../platform/desktopApi'

/** Desktop PKMS session editing the connected folder's actual Markdown file. */
export async function createPkmsLocalEditorSession(
  workspaceId: string,
  file: FileRecord
): Promise<EditorDocumentSession> {
  const desktop = desktopBridge()
  if (!desktop)
    throw new EditorProviderError(
      'unsupported',
      'Local folder editing is available in the desktop app'
    )
  const initial = await desktop.readLocalMarkdown(workspaceId, file.path)
  let item: EditorTreeItem = {
    providerId: `pkms:${workspaceId}`,
    itemId: file.id,
    parentId: null,
    name: entryName(file.path),
    path: file.path,
    kind: 'markdown',
    readOnly: false
  }
  let text = initial.text
  let revision = initial.revision
  let phase: EditorDocumentSnapshot['savePhase'] = 'clean'
  let syncPhase: NonNullable<EditorDocumentSnapshot['syncPhase']> = 'pending'
  let message: string | undefined
  let editGeneration = 0
  let closed = false
  let readRetryDelayMs = 1_000
  let nextReadAt = 0
  let pollInFlight = false
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<(snapshot: EditorDocumentSnapshot) => void>()
  let session: EditorDocumentSession
  const snapshot = (): EditorDocumentSnapshot => ({
    content: { type: 'text', text },
    revision,
    savePhase: phase,
    syncPhase,
    ...(message ? { message } : {})
  })
  const emit = () => {
    const value = snapshot()
    for (const listener of listeners) listener(value)
  }
  const scheduleAutoSave = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = undefined
      if (closed || phase !== 'dirty') return
      void session.save().catch(() => undefined)
    }, 5_000)
  }
  const poll = setInterval(() => {
    if (closed || pollInFlight) return
    pollInFlight = true
    const shouldRead = phase === 'clean' || (phase === 'error' && Date.now() >= nextReadAt)
    const readGeneration = editGeneration
    void Promise.allSettled([
      desktop.syncBridgeStatus(workspaceId),
      shouldRead ? desktop.readLocalMarkdown(workspaceId, item.path) : Promise.resolve(null)
    ])
      .then(([syncResult, fileResult]) => {
        if (closed) return
        let changed = false
        if (syncResult.status === 'fulfilled') {
          const nextSync: typeof syncPhase =
            phase !== 'clean'
              ? 'pending'
              : syncResult.value.state === 'synced'
                ? 'synced'
                : syncResult.value.state === 'offline' || syncResult.value.state === 'error'
                  ? 'blocked'
                  : 'pending'
          changed ||= nextSync !== syncPhase
          syncPhase = nextSync
        }
        if (
          fileResult.status === 'fulfilled' &&
          fileResult.value &&
          (phase === 'clean' || phase === 'error') &&
          editGeneration === readGeneration
        ) {
          readRetryDelayMs = 1_000
          nextReadAt = 0
          if (fileResult.value.revision !== revision) {
            text = fileResult.value.text
            revision = fileResult.value.revision
            syncPhase = 'pending'
            changed = true
          }
          if (phase === 'error') {
            phase = 'clean'
            message = undefined
            changed = true
          }
        }
        if (
          fileResult.status === 'rejected' &&
          (phase === 'clean' || phase === 'error') &&
          editGeneration === readGeneration
        ) {
          const nextMessage =
            fileResult.reason instanceof Error
              ? fileResult.reason.message
              : 'Could not read local file'
          changed ||= phase !== 'error' || message !== nextMessage
          phase = 'error'
          message = nextMessage
          nextReadAt = Date.now() + readRetryDelayMs
          readRetryDelayMs = Math.min(30_000, readRetryDelayMs * 2)
        }
        if (changed) emit()
      })
      .finally(() => {
        pollInFlight = false
      })
  }, 1000)
  session = {
    get item() {
      return item
    },
    readOnly: false,
    updateItem(next) {
      if (next.providerId === item.providerId) item = next
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => listeners.delete(listener)
    },
    async replaceText(value, baseRevision) {
      if (closed) throw new EditorProviderError('notFound', 'Document session is closed')
      if (baseRevision !== revision) {
        phase = 'conflict'
        message = 'The local file changed outside PKMS. Reopen it before editing.'
        emit()
        throw new EditorProviderError('conflict', message)
      }
      if (value === text) return
      text = value
      editGeneration++
      phase = 'dirty'
      syncPhase = 'pending'
      message = undefined
      emit()
      scheduleAutoSave()
    },
    async save() {
      if (closed) throw new EditorProviderError('notFound', 'Document session is closed')
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        autoSaveTimer = undefined
      }
      if (phase !== 'dirty') return snapshot()
      const savingText = text
      const savingGeneration = editGeneration
      phase = 'saving'
      syncPhase = 'pending'
      emit()
      try {
        const result = await desktop.writeLocalMarkdown(
          workspaceId,
          item.path,
          savingText,
          revision
        )
        revision = result.revision
        phase = editGeneration === savingGeneration ? 'clean' : 'dirty'
        message = undefined
      } catch (error) {
        phase = 'conflict'
        message = error instanceof Error ? error.message : 'Could not save local file'
        emit()
        throw new EditorProviderError('conflict', message)
      }
      emit()
      if (phase === 'dirty') scheduleAutoSave()
      return snapshot()
    },
    async close() {
      if (closed) return
      closed = true
      clearInterval(poll)
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      listeners.clear()
    }
  }
  return session
}
