import * as Y from 'yjs'
import type { GoogleDriveOperationLog } from './operationLog'
import { enqueueDriveMutation, type DriveOutbox, type DriveOutboxOperation } from './outbox'
import type { GoogleDriveWorkspaceRepository } from './workspaceRepository'

const REMOTE_UPDATE_ORIGIN = Symbol('pkms-google-drive-remote-update')

export interface GoogleDriveYjsDocumentHandle {
  doc: Y.Doc
  flush(): Promise<void>
  close(): Promise<void>
}

export interface GoogleDriveYjsDocumentStorage {
  open(documentKey: string): Promise<GoogleDriveYjsDocumentHandle>
}

interface OpenDocument {
  fileId: string
  handle: GoogleDriveYjsDocumentHandle
  text: Y.Text
  pending: Promise<void>
  queueFailed: boolean
  onUpdate: (update: Uint8Array, origin: unknown) => void
}

export function googleDriveDocumentSeedOperationId(fileId: string): string {
  const bytes = new TextEncoder().encode(fileId)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `seed-${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`
}

function seedClientId(fileId: string): number {
  let hash = 2166136261
  for (const byte of new TextEncoder().encode(fileId)) hash = Math.imul(hash ^ byte, 16777619)
  return hash >>> 0 || 1
}

/** Identical file ID + seed text produce identical Yjs structs on every replica. */
export function encodeGoogleDriveDocumentSeed(fileId: string, text: string): Uint8Array {
  const seed = new Y.Doc({ guid: `pkms-google-drive-seed:${fileId}` })
  seed.clientID = seedClientId(fileId)
  seed.getText('content').insert(0, text)
  const update = Y.encodeStateAsUpdate(seed)
  seed.destroy()
  return update
}

function documentHasState(doc: Y.Doc): boolean {
  return Y.decodeStateVector(Y.encodeStateVector(doc)).size > 0
}

/**
 * Owns durable Yjs replicas for Drive Markdown files. Initial Markdown is recorded once as a
 * deterministic seed operation; local updates are durably queued before callers can save.
 */
export class GoogleDriveYjsDocumentStore {
  private readonly documents = new Map<string, Promise<OpenDocument>>()

  constructor(
    readonly workspaceRootId: string,
    private readonly repository: GoogleDriveWorkspaceRepository,
    private readonly operationLog: Pick<GoogleDriveOperationLog, 'listDocumentOperations'>,
    private readonly outbox: DriveOutbox,
    private readonly storage: GoogleDriveYjsDocumentStorage
  ) {
    if (repository.rootId !== workspaceRootId)
      throw new Error('The Yjs document store and repository must use the same Drive workspace.')
  }

  async open(fileId: string): Promise<{ doc: Y.Doc; text: Y.Text }> {
    const document = await this.getDocument(fileId)
    await this.ensureInitialState(document)
    return { doc: document.handle.doc, text: document.text }
  }

  async applyDocumentSeed(fileId: string, text: string): Promise<void> {
    const document = await this.getDocument(fileId)
    Y.applyUpdate(
      document.handle.doc,
      encodeGoogleDriveDocumentSeed(fileId, text),
      REMOTE_UPDATE_ORIGIN
    )
    await document.handle.flush()
  }

  async applyDocumentUpdate(fileId: string, update: Uint8Array): Promise<void> {
    const document = await this.getDocument(fileId)
    await this.ensureInitialState(document)
    Y.applyUpdate(document.handle.doc, update, REMOTE_UPDATE_ORIGIN)
    await document.handle.flush()
  }

  async projectDocument(fileId: string): Promise<void> {
    const document = await this.getDocument(fileId)
    await this.flushLocal(document)
    const bytes = new TextEncoder().encode(document.text.toString())
    await this.repository.writeFile(fileId, bytes, 'text/markdown')
  }

  async flushLocalDocument(fileId: string): Promise<DriveOutboxOperation[]> {
    const document = await this.getDocument(fileId)
    await this.flushLocal(document)
    return this.outbox.list(this.workspaceRootId)
  }

  async close(): Promise<void> {
    const documents = await Promise.allSettled([...this.documents.values()])
    this.documents.clear()
    const closing = documents.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    )
    await Promise.all(
      closing.map(async (document) => {
        await this.flushLocal(document)
        document.handle.doc.off('update', document.onUpdate)
        await document.handle.close()
        document.handle.doc.destroy()
      })
    )
  }

  private getDocument(fileId: string): Promise<OpenDocument> {
    let document = this.documents.get(fileId)
    if (!document) {
      document = this.openDocument(fileId)
      this.documents.set(fileId, document)
      void document.catch(() => {
        if (this.documents.get(fileId) === document) this.documents.delete(fileId)
      })
    }
    return document
  }

  private async openDocument(fileId: string): Promise<OpenDocument> {
    const handle = await this.storage.open(`${this.workspaceRootId}:${fileId}`)
    const text = handle.doc.getText('content')
    const document: OpenDocument = {
      fileId,
      handle,
      text,
      pending: Promise.resolve(),
      queueFailed: false,
      onUpdate: () => {}
    }
    document.onUpdate = (update, origin) => {
      if (origin === REMOTE_UPDATE_ORIGIN) return
      const delta = update.slice()
      const persist = async () => {
        const mutationUpdate = document.queueFailed ? Y.encodeStateAsUpdate(handle.doc) : delta
        await enqueueDriveMutation(this.outbox, this.workspaceRootId, {
          type: 'document-update',
          fileId,
          update: mutationUpdate
        })
        await handle.flush()
        document.queueFailed = false
      }
      document.pending = document.pending
        .catch(() => {})
        .then(persist)
        .catch((cause) => {
          document.queueFailed = true
          throw cause
        })
    }
    handle.doc.on('update', document.onUpdate)
    return document
  }

  private async ensureInitialState(document: OpenDocument): Promise<void> {
    if (documentHasState(document.handle.doc)) return

    const queued = await this.outbox.list(this.workspaceRootId)
    const queuedSeed = queued.find(
      (operation) =>
        operation.mutation.type === 'document-seed' && operation.mutation.fileId === document.fileId
    )
    const remoteOperations = await this.operationLog.listDocumentOperations(document.fileId)
    const seed =
      remoteOperations.find(
        (operation) =>
          operation.mutation.type === 'document-seed' &&
          operation.operationId === googleDriveDocumentSeedOperationId(document.fileId)
      ) ?? queuedSeed
    if (seed?.mutation.type === 'document-seed') {
      Y.applyUpdate(
        document.handle.doc,
        encodeGoogleDriveDocumentSeed(document.fileId, seed.mutation.text),
        REMOTE_UPDATE_ORIGIN
      )
      const documentUpdates = [
        ...remoteOperations.filter(
          (operation) =>
            operation.mutation.type === 'document-update' &&
            operation.mutation.fileId === document.fileId
        ),
        ...queued.filter(
          (operation) =>
            operation.mutation.type === 'document-update' &&
            operation.mutation.fileId === document.fileId
        )
      ].sort(
        (left, right) =>
          left.sequence - right.sequence || left.deviceId.localeCompare(right.deviceId)
      )
      for (const operation of documentUpdates) {
        if (operation.mutation.type === 'document-update')
          Y.applyUpdate(document.handle.doc, operation.mutation.update, REMOTE_UPDATE_ORIGIN)
      }
      await document.handle.flush()
      return
    }

    if (remoteOperations.length)
      throw new Error(`Google Drive document ${document.fileId} has updates without a seed.`)

    const createOperation = queued.find(
      (operation) =>
        operation.mutation.type === 'create-file' &&
        (operation.mutation.itemId ?? operation.operationId) === document.fileId
    )
    const initialBytes =
      createOperation?.mutation.type === 'create-file'
        ? createOperation.mutation.bytes
        : (await this.repository.readFile(document.fileId)).bytes
    const initialText = new TextDecoder('utf-8', { fatal: true }).decode(initialBytes)
    const seedOperation: DriveOutboxOperation = {
      workspaceRootId: this.workspaceRootId,
      operationId: googleDriveDocumentSeedOperationId(document.fileId),
      deviceId: 'pkms-google-drive-seed',
      sequence: 0,
      createdAt: 0,
      mutation: { type: 'document-seed', fileId: document.fileId, text: initialText }
    }
    await this.outbox.enqueue(seedOperation)
    await this.applyDocumentSeed(document.fileId, initialText)
  }

  private async flushLocal(document: OpenDocument): Promise<void> {
    try {
      await document.pending
    } catch {
      document.queueFailed = true
    }
    if (document.queueFailed) {
      await enqueueDriveMutation(this.outbox, this.workspaceRootId, {
        type: 'document-update',
        fileId: document.fileId,
        update: Y.encodeStateAsUpdate(document.handle.doc)
      })
      await document.handle.flush()
      document.queueFailed = false
      document.pending = Promise.resolve()
    }
    await document.handle.flush()
  }
}
