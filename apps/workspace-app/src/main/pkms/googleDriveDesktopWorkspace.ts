import * as Y from 'yjs'
import {
  GoogleDriveAssetConflictMaterializer,
  GoogleDriveClient,
  GoogleDriveOperationLog,
  GoogleDriveWorkspaceRepository,
  GoogleDriveYjsDocumentStore,
  createGoogleDriveWorkspaceSync
} from '@pkms/google-drive'
import { googleDriveDesktopOAuth } from './googleDriveDesktopOAuthRuntime'
import { GoogleDriveDesktopStorage } from './googleDriveDesktopStorage'

const WORKSPACE_MARKER = 'pkms-google-drive-v1'
const WORKSPACE_ROOT_QUERY =
  "mimeType = 'application/vnd.google-apps.folder' and trashed = false and appProperties has { key='pkmsWorkspace' and value='pkms-google-drive-v1' }"

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

  async listRoots() {
    return this.client.listFiles({
      query: WORKSPACE_ROOT_QUERY,
      pageSize: 100,
      fields: 'id,name,mimeType,appProperties,webViewLink'
    })
  }

  async createWorkspace() {
    const root = await this.client.createFolder('PKMS', null, { pkmsWorkspace: WORKSPACE_MARKER })
    return this.connect(root.id)
  }

  async connect(rootId: string) {
    const root = await this.client.getFile(rootId)
    if (
      root.trashed ||
      root.mimeType !== 'application/vnd.google-apps.folder' ||
      root.appProperties?.pkmsWorkspace !== WORKSPACE_MARKER
    )
      throw new Error('The selected folder is not a PKMS Google Drive workspace.')

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
    return this.requireWorkspace(rootId).repository.listDirectoryById(parentItemId)
  }

  async openMarkdown(rootId: string, fileId: string) {
    const runtime = this.requireWorkspace(rootId)
    const entry = await runtime.repository.getEntry(fileId)
    if (entry.kind !== 'markdown')
      throw new Error('Only Markdown files can be opened in this editor.')
    const { doc, text } = await runtime.documents.open(fileId)
    return { entry, text: text.toString(), revision: documentRevision(doc, text) }
  }

  async saveMarkdown(rootId: string, fileId: string, text: string) {
    const runtime = this.requireWorkspace(rootId)
    const { doc, text: sharedText } = await runtime.documents.open(fileId)
    if (sharedText.toString() !== text) {
      doc.transact(() => {
        if (sharedText.length) sharedText.delete(0, sharedText.length)
        if (text) sharedText.insert(0, text)
      }, 'pkms-google-drive-desktop-editor')
    }
    await runtime.documents.flushLocalDocument(fileId)
    const sync = await runtime.engine.sync()
    return { revision: documentRevision(doc, sharedText), sync }
  }

  async sync(rootId: string) {
    return this.requireWorkspace(rootId).engine.sync()
  }

  async createItem(rootId: string, parentPath: string, kind: 'markdown' | 'folder', name: string) {
    const runtime = this.requireWorkspace(rootId)
    const path = parentPath ? `${parentPath}/${name}` : name
    if (kind === 'folder') await runtime.engine.enqueue({ type: 'create-folder', path })
    else
      await runtime.engine.enqueue({
        type: 'create-file',
        path,
        mimeType: 'text/markdown',
        bytes: new TextEncoder().encode('')
      })
    await runtime.engine.sync()
    return runtime.repository.listDirectory(parentPath)
  }

  async rename(rootId: string, fileId: string, name: string) {
    const runtime = this.requireWorkspace(rootId)
    await runtime.engine.enqueue({ type: 'rename', fileId, name })
    await runtime.engine.sync()
    return runtime.repository.getEntry(fileId)
  }

  async trash(rootId: string, fileId: string) {
    const runtime = this.requireWorkspace(rootId)
    await runtime.engine.enqueue({ type: 'trash', fileId })
    await runtime.engine.sync()
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
}
