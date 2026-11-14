import * as Y from 'yjs'
import type {
  EditorDocumentSession,
  EditorDocumentSnapshot,
  EditorTreeItem,
  EditorSyncPhase
} from '@workspace/editor'
import { EditorProviderError, editorDocumentKey } from '@workspace/editor'
import type { FileRecord } from '../../domain/types'
import { entryName } from '../../domain/fileTree'
import type { PkmsSaveResult } from './useDocumentSync'

export type PkmsDocumentSave = (
  fileId: string,
  doc: Y.Doc,
  flushToGitHub?: boolean,
  documentKey?: string
) => Promise<PkmsSaveResult>

function itemFor(workspaceId: string, file: FileRecord): EditorTreeItem {
  return {
    providerId: `pkms:${workspaceId}`,
    itemId: file.id,
    parentId: null,
    name: entryName(file.path),
    path: file.path,
    kind: file.kind === 'markdown' ? 'markdown' : file.kind === 'folder' ? 'directory' : 'asset',
    readOnly: file.kind !== 'markdown'
  }
}

/** Editor session backed by the existing PKMS Y.Doc and IndexedDB lifecycle. */
export function createPkmsYjsEditorSession(
  workspaceId: string,
  file: FileRecord,
  doc: Y.Doc,
  text: Y.Text,
  saveDocument: PkmsDocumentSave
): EditorDocumentSession {
  let item = itemFor(workspaceId, file)
  const origin = Symbol(`editor:${file.id}`)
  const listeners = new Set<(snapshot: EditorDocumentSnapshot) => void>()
  let phase: EditorDocumentSnapshot['savePhase'] = 'clean'
  let syncPhase: EditorSyncPhase = 'idle'
  let message: string | undefined
  let sequence = 0
  let closed = false
  let saveTail: Promise<void> = Promise.resolve()

  const revision = () => `${doc.clientID}:${sequence}:${text.length}`
  const snapshot = (): EditorDocumentSnapshot => ({
    content: { type: 'text', text: text.toString() },
    revision: revision(),
    savePhase: phase,
    syncPhase,
    ...(message ? { message } : {})
  })
  const emit = () => {
    const value = snapshot()
    for (const listener of listeners) listener(value)
  }
  const onText = (event: Y.YTextEvent) => {
    sequence++
    if (event.transaction.origin !== 'server') {
      phase = 'dirty'
      syncPhase = 'pending'
      message = undefined
    } else if (phase === 'clean') {
      // A remote edit is durable on the PKMS server, but its GitHub mirror may now lag.
      syncPhase = 'pending'
    }
    emit()
  }
  text.observe(onText)

  const performSave = async (
    options: { flushSync?: boolean } = {}
  ): Promise<EditorDocumentSnapshot> => {
    if (closed) throw new EditorProviderError('notFound', 'Document session is closed')
    if (file.kind !== 'markdown') return snapshot()
    const savedSequence = sequence
    phase = 'saving'
    syncPhase = 'pending'
    message = undefined
    emit()
    try {
      const result = await saveDocument(
        file.id,
        doc,
        options.flushSync !== false,
        editorDocumentKey(item)
      )
      syncPhase = result.syncPhase
      phase = sequence === savedSequence ? result.savePhase : 'dirty'
      if (sequence !== savedSequence) syncPhase = 'pending'
      message = result.message
      if (phase === 'error')
        throw new EditorProviderError('unknown', message ?? 'Could not save PKMS document')
    } catch (error) {
      phase = 'error'
      syncPhase = 'blocked'
      message = error instanceof Error ? error.message : 'Could not save PKMS document'
      emit()
      throw error
    }
    emit()
    return snapshot()
  }

  return {
    get item() {
      return item
    },
    readOnly: file.kind !== 'markdown',
    updateItem(nextItem) {
      if (nextItem.providerId !== item.providerId || nextItem.itemId !== item.itemId) return
      item = nextItem
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => listeners.delete(listener)
    },
    async replaceText(value, baseRevision) {
      if (closed) throw new EditorProviderError('notFound', 'Document session is closed')
      if (file.kind !== 'markdown')
        throw new EditorProviderError('readOnly', 'PKMS asset documents are read only')
      if (baseRevision !== revision()) {
        phase = 'conflict'
        message = 'The collaborative document changed before this edit was applied.'
        emit()
        throw new EditorProviderError('conflict', message)
      }
      const previous = text.toString()
      let prefix = 0
      while (
        prefix < previous.length &&
        prefix < value.length &&
        previous[prefix] === value[prefix]
      )
        prefix++
      let suffix = 0
      while (
        suffix < previous.length - prefix &&
        suffix < value.length - prefix &&
        previous[previous.length - suffix - 1] === value[value.length - suffix - 1]
      )
        suffix++
      if (prefix === previous.length && prefix === value.length) return
      doc.transact(() => {
        if (previous.length - prefix - suffix)
          text.delete(prefix, previous.length - prefix - suffix)
        if (value.length - prefix - suffix)
          text.insert(prefix, value.slice(prefix, value.length - suffix))
      }, origin)
    },
    save(options = {}) {
      const task = saveTail.catch(() => {}).then(() => performSave(options))
      saveTail = task.then(
        () => {},
        () => {}
      )
      return task
    },
    async close() {
      if (closed) return
      closed = true
      text.unobserve(onText)
      listeners.clear()
    }
  }
}

export function pkmsItemForFile(workspaceId: string, file: FileRecord): EditorTreeItem {
  const item = itemFor(workspaceId, file)
  return { ...item, parentId: null }
}

export function createPkmsAssetEditorSession(
  workspaceId: string,
  file: FileRecord,
  previewUrl: string,
  mediaType: string,
  dispose: () => void
): EditorDocumentSession {
  let item = itemFor(workspaceId, file)
  const value: EditorDocumentSnapshot = {
    content: { type: 'asset', previewUrl, mediaType },
    revision: `${file.id}:${file.revision}`,
    savePhase: 'clean',
    syncPhase: 'idle'
  }
  let closed = false
  return {
    get item() {
      return item
    },
    readOnly: true,
    updateItem(nextItem) {
      if (nextItem.providerId !== item.providerId || nextItem.itemId !== item.itemId) return
      item = nextItem
    },
    snapshot: () => value,
    subscribe(listener) {
      listener(value)
      return () => {}
    },
    async replaceText() {
      throw new EditorProviderError('readOnly', 'PKMS assets are read only')
    },
    async save() {
      return value
    },
    async close() {
      if (closed) return
      closed = true
      dispose()
    }
  }
}
