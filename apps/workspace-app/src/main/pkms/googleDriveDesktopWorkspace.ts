import * as Y from 'yjs'
import {
  GoogleDriveAssetConflictMaterializer,
  GoogleDriveClient,
  GoogleDriveOperationLog,
  GoogleDriveWorkspaceRepository,
  type GoogleDriveWorkspaceEntry,
  listGoogleDriveWorkspaceRoots,
  resolveGoogleDriveWorkspaceRoot,
  GoogleDriveYjsDocumentStore,
  createGoogleDriveWorkspaceSync,
  replaceGoogleDriveYText
} from '@pkms/google-drive'
import { googleDriveDesktopOAuth } from './googleDriveDesktopOAuthRuntime'
import { GoogleDriveDesktopStorage } from './googleDriveDesktopStorage'
import { listGoogleDriveDirectoryOrPendingFolder } from './googleDriveWorkspaceDirectory'

interface DesktopWorkspaceRuntime {
  rootId: string
  repository: GoogleDriveWorkspaceRepository
  documents: GoogleDriveYjsDocumentStore
  engine: ReturnType<typeof createGoogleDriveWorkspaceSync>['engine']
}

function documentRevision(doc: Y.Doc, text: Y.Text): string {
  const vector = Y.encodeStateVector(doc)
  return `${doc.clientID}:${Array.from(vector).join('.')}:${text.length}`
}

/** Main-process boundary for Desktop Drive access; credentials and local queue stay native. */
export class GoogleDriveDesktopWorkspaceService {
  private readonly storage = new GoogleDriveDesktopStorage()
  private readonly client = new GoogleDriveClient({ tokenProvider: googleDriveDesktopOAuth })
  private readonly workspaces = new Map<string, DesktopWorkspaceRuntime>()
  private readonly activeSyncs = new Map<
    string,
    Promise<Awaited<ReturnType<DesktopWorkspaceRuntime['engine']['sync']>>>
  >()
  private readonly syncRequestedAgain = new Set<string>()

  async listRoots() {
    return listGoogleDriveWorkspaceRoots(this.client)
  }

  async createWorkspace() {
    return this.connect((await resolveGoogleDriveWorkspaceRoot(this.client)).id)
  }

  async connect(rootId: string) {
    const root = await resolveGoogleDriveWorkspaceRoot(this.client, rootId)

    await this.disconnect(rootId)
    const repository = new GoogleDriveWorkspaceRepository(this.client, rootId)
    const operationLog = new GoogleDriveOperationLog(this.client, rootId)
    const assetMaterializer = new GoogleDriveAssetConflictMaterializer(repository, operationLog)
    const documents = new GoogleDriveYjsDocumentStore(
      rootId,
      repository,
      operationLog,
      this.storage,
      this.storage
    )
    const { engine } = createGoogleDriveWorkspaceSync({
      repository,
      operationLog,
      outbox: this.storage,
      documents,
      applyAssetReplacement: (fileId, mimeType, bytes, operation) =>
        assetMaterializer.apply(fileId, mimeType, bytes, operation)
    })
    const runtime = { rootId, repository, documents, engine }
    await engine.sync()
    this.workspaces.set(rootId, runtime)
    return { root, entries: await repository.listDirectory('') }
  }

  async listDirectory(rootId: string, parentItemId: string | null) {
    const runtime = this.requireWorkspace(rootId)
    return listGoogleDriveDirectoryOrPendingFolder(
      runtime.repository,
      this.storage,
      rootId,
      parentItemId
    )
  }

  async search(rootId: string, query: string, pageToken?: string) {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 256)
      throw new Error('invalid_google_drive_search_query')
    return this.requireWorkspace(rootId).repository.searchFullTextPage(query, {
      pageToken,
      pageSize: 40
    })
  }

  async openMarkdown(rootId: string, fileId: string, knownEntry?: GoogleDriveWorkspaceEntry) {
    const runtime = this.requireWorkspace(rootId)
    let entry = knownEntry?.id === fileId ? knownEntry : undefined
    try {
      entry ??= await runtime.repository.getEntry(fileId)
    } catch (cause) {
      const pending = (await this.storage.list(rootId)).find(
        (operation) =>
          operation.mutation.type === 'create-file' &&
          (operation.mutation.itemId ?? operation.operationId) === fileId
      )
      if (!pending || pending.mutation.type !== 'create-file') throw cause
      const path = pending.mutation.path
      const name = path.split('/').at(-1) ?? path
      entry = {
        id: fileId,
        name,
        mimeType: pending.mutation.mimeType,
        path,
        kind: 'markdown' as const,
        appProperties: { pkmsWorkspaceRootId: rootId, pkmsItemId: fileId }
      }
    }
    if (entry.kind !== 'markdown')
      throw new Error('Only Markdown files can be opened in this editor.')
    const { doc, text } = await runtime.documents.open(fileId)
    return { entry, text: text.toString(), revision: documentRevision(doc, text) }
  }

  async saveMarkdown(rootId: string, fileId: string, text: string, flushSync = true) {
    const runtime = this.requireWorkspace(rootId)
    const { doc, text: sharedText } = await runtime.documents.open(fileId)
    if (sharedText.toString() !== text) {
      doc.transact(() => {
        replaceGoogleDriveYText(sharedText, text)
      }, 'pkms-google-drive-desktop-editor')
    }
    let sync
    if (flushSync) {
      await runtime.documents.flushLocalDocument(fileId)
      sync = await runtime.engine.sync()
    } else {
      await runtime.documents.persistLocalDocument(fileId)
      sync = { uploadedOperations: 0, appliedOperations: 0, pendingOperations: 1 }
    }
    return { revision: documentRevision(doc, sharedText), sync }
  }

  async sync(rootId: string) {
    const active = this.activeSyncs.get(rootId)
    if (active) {
      this.syncRequestedAgain.add(rootId)
      return active
    }
    const runtime = this.requireWorkspace(rootId)
    const task = (async () => {
      let result: Awaited<ReturnType<DesktopWorkspaceRuntime['engine']['sync']>>
      do {
        this.syncRequestedAgain.delete(rootId)
        await runtime.documents.flushOpenDocuments()
        result = await runtime.engine.sync()
      } while (this.syncRequestedAgain.has(rootId))
      return result
    })().finally(() => {
      this.activeSyncs.delete(rootId)
    })
    this.activeSyncs.set(rootId, task)
    return task
  }

  async createItem(
    rootId: string,
    parentPath: string,
    kind: 'markdown' | 'folder',
    name: string,
    itemId?: string,
    parentItemId?: string
  ) {
    const runtime = this.requireWorkspace(rootId)
    const path = parentPath ? `${parentPath}/${name}` : name
    const operation =
      kind === 'folder'
        ? await runtime.engine.enqueue({ type: 'create-folder', path, itemId })
        : await runtime.engine.enqueue({
            type: 'create-file',
            path,
            mimeType: 'text/markdown',
            bytes: new TextEncoder().encode(''),
            itemId
          })
    this.syncInBackground(rootId)
    const stableItemId =
      operation.mutation.type === 'create-file' || operation.mutation.type === 'create-folder'
        ? (operation.mutation.itemId ?? operation.operationId)
        : operation.operationId
    return {
      id: stableItemId,
      name,
      mimeType: kind === 'folder' ? 'application/vnd.google-apps.folder' : 'text/markdown',
      parents: [parentItemId ?? rootId],
      appProperties: { pkmsWorkspaceRootId: rootId, pkmsItemId: stableItemId },
      path,
      kind
    }
  }

  async rename(
    rootId: string,
    fileId: string,
    name: string,
    currentEntry?: GoogleDriveWorkspaceEntry
  ) {
    const runtime = this.requireWorkspace(rootId)
    const current = currentEntry ?? (await runtime.repository.getEntry(fileId))
    await runtime.engine.enqueue({ type: 'rename', fileId, name })
    this.syncInBackground(rootId)
    const parentPath = current.path.split('/').slice(0, -1).join('/')
    return { ...current, name, path: parentPath ? `${parentPath}/${name}` : name }
  }

  async trash(rootId: string, fileId: string) {
    const runtime = this.requireWorkspace(rootId)
    await runtime.engine.enqueue({ type: 'trash', fileId })
    this.syncInBackground(rootId)
  }

  async move(rootId: string, fileIds: string[], targetDirectoryPath: string) {
    const runtime = this.requireWorkspace(rootId)
    for (const fileId of fileIds)
      await runtime.engine.enqueue({ type: 'move', fileId, targetDirectoryPath })
    this.syncInBackground(rootId)
  }

  async disconnect(rootId: string): Promise<void> {
    const runtime = this.workspaces.get(rootId)
    if (!runtime) return
    this.workspaces.delete(rootId)
    await runtime.documents.close()
  }

  async close(): Promise<void> {
    await Promise.all([...this.workspaces.keys()].map((rootId) => this.disconnect(rootId)))
    this.storage.closeDatabase()
  }

  private requireWorkspace(rootId: string): DesktopWorkspaceRuntime {
    const runtime = this.workspaces.get(rootId)
    if (!runtime) throw new Error('Connect this PKMS Google Drive workspace first.')
    return runtime
  }

  private syncInBackground(rootId: string): void {
    void this.sync(rootId).catch(() => {
      // The durable outbox retains failed operations for the next online retry.
    })
  }
}
