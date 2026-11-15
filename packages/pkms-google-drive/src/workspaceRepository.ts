import { GoogleDriveClient, type DriveFile } from './googleDriveClient'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const INTERNAL_DIRECTORY = '.pkms-sync'
const WORKSPACE_ROOT_MARKER = { pkmsWorkspace: 'pkms-google-drive-v1' }

/** Finds the unique app-owned root across devices, or creates it if none exists. */
export async function resolveGoogleDriveWorkspaceRoot(
  client: GoogleDriveClient,
  pinnedRootId?: string
): Promise<DriveFile> {
  if (pinnedRootId) {
    const pinned = await client.getFile(pinnedRootId)
    if (pinned.trashed || pinned.mimeType !== FOLDER_MIME)
      throw new Error('The pinned Google Drive workspace root is unavailable.')
    return pinned
  }

  const roots = await client.listFiles({
    query: `mimeType = '${FOLDER_MIME}' and trashed = false and appProperties has { key='pkmsWorkspace' and value='${WORKSPACE_ROOT_MARKER.pkmsWorkspace}' }`,
    pageSize: 100,
    fields: 'id,name,mimeType,parents,trashed,appProperties,webViewLink'
  })
  if (roots.length > 1)
    throw new Error(
      'More than one PKMS Google Drive workspace root exists; choose a root explicitly before syncing.'
    )
  if (roots.length === 1) return roots[0]

  return client.createFolder('PKMS', null, WORKSPACE_ROOT_MARKER)
}

export type GoogleDriveWorkspaceEntry = DriveFile & {
  path: string
  kind: 'folder' | 'markdown' | 'asset'
}

function entryKind(file: DriveFile): GoogleDriveWorkspaceEntry['kind'] {
  if (file.mimeType === FOLDER_MIME) return 'folder'
  return file.name.toLowerCase().endsWith('.md') || file.mimeType === 'text/markdown'
    ? 'markdown'
    : 'asset'
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function splitItemPath(path: string): { parentPath: string; name: string } {
  const segments = path.split('/')
  const name = segments.pop() ?? ''
  if (!name || segments.some((segment) => !segment || segment === '.' || segment === '..'))
    throw new Error(`Invalid Google Drive workspace item path: ${path}`)
  if (name === '.' || name === '..' || name.includes('\0'))
    throw new Error(`Invalid Google Drive workspace item name: ${name}`)
  return { parentPath: segments.join('/'), name }
}

function queryLiteral(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Maps one explicitly selected Drive folder to a PKMS workspace tree.
 * Drive IDs remain stable identities; paths are derived from parent IDs.
 */
export class GoogleDriveWorkspaceRepository {
  constructor(
    readonly client: GoogleDriveClient,
    readonly rootId: string
  ) {
    if (!rootId.trim()) throw new Error('A Google Drive workspace root ID is required.')
  }

  static async connect(
    client: GoogleDriveClient,
    pinnedRootId?: string
  ): Promise<GoogleDriveWorkspaceRepository> {
    const root = await resolveGoogleDriveWorkspaceRoot(client, pinnedRootId)
    return new GoogleDriveWorkspaceRepository(client, root.id)
  }

  async getRoot(): Promise<DriveFile> {
    const root = await this.client.getFile(this.rootId)
    if (root.trashed || root.mimeType !== FOLDER_MIME)
      throw new Error('The selected Google Drive workspace root is unavailable.')
    return root
  }

  async listDirectory(path: string): Promise<GoogleDriveWorkspaceEntry[]> {
    const parent = await this.resolveDirectory(path)
    const children = await this.client.listChildren(parent.id)
    return children
      .filter((file) => !(path === '' && file.name === INTERNAL_DIRECTORY))
      .map((file) => ({ ...file, path: joinPath(path, file.name), kind: entryKind(file) }))
      .sort((left, right) => {
        if (left.kind === 'folder' && right.kind !== 'folder') return -1
        if (left.kind !== 'folder' && right.kind === 'folder') return 1
        return left.name.localeCompare(right.name, undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      })
  }

  /** Recursively lists visible user files, including empty folders and dotfiles. */
  async listTree(options: { concurrency?: number } = {}): Promise<GoogleDriveWorkspaceEntry[]> {
    await this.getRoot()
    const result: GoogleDriveWorkspaceEntry[] = []
    const pending = [{ id: this.rootId, path: '' }]
    const visited = new Set<string>()
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 8, 32))
    let failure: unknown

    const worker = async () => {
      while (pending.length && failure === undefined) {
        const directory = pending.shift()!
        if (visited.has(directory.id)) continue
        visited.add(directory.id)
        try {
          const children = await this.client.listChildren(directory.id)
          for (const file of children) {
            if (directory.id === this.rootId && file.name === INTERNAL_DIRECTORY) continue
            const path = joinPath(directory.path, file.name)
            result.push({ ...file, path, kind: entryKind(file) })
            if (file.mimeType === FOLDER_MIME) pending.push({ id: file.id, path })
          }
        } catch (cause) {
          failure = cause
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker))
    if (failure !== undefined) throw failure
    return result.sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { numeric: true })
    )
  }

  async readFile(fileId: string): Promise<{ metadata: DriveFile; bytes: Uint8Array }> {
    const metadata = await this.client.getFile(fileId)
    if (metadata.trashed || metadata.mimeType === FOLDER_MIME)
      throw new Error('The requested Drive item is not a readable file.')
    return { metadata, bytes: await this.client.download(fileId) }
  }

  async createFolder(parentPath: string, name: string): Promise<GoogleDriveWorkspaceEntry> {
    const parent = await this.resolveDirectory(parentPath)
    const folder = await this.client.createFolder(name, parent.id)
    return { ...folder, path: joinPath(parentPath, folder.name), kind: 'folder' }
  }

  /** Creates a folder once per durable operation ID, including after a lost HTTP ACK. */
  async createFolderOnce(operationId: string, path: string): Promise<GoogleDriveWorkspaceEntry> {
    const { parentPath, name } = splitItemPath(path)
    const parent = await this.resolveDirectory(parentPath)
    const digest = await sha256Hex(
      new TextEncoder().encode(
        JSON.stringify({ kind: 'folder', rootId: this.rootId, parentId: parent.id, name })
      )
    )
    const existing = await this.findCreatedItem(operationId)
    if (existing)
      return this.validateCreatedItem(existing, parent.id, name, FOLDER_MIME, digest, path)

    const appProperties = this.createOperationProperties(operationId, digest)
    try {
      const folder = await this.client.createFolder(name, parent.id, appProperties)
      return { ...folder, path, kind: 'folder' }
    } catch (cause) {
      const recovered = await this.findCreatedItem(operationId).catch(() => null)
      if (recovered)
        return this.validateCreatedItem(recovered, parent.id, name, FOLDER_MIME, digest, path)
      throw cause
    }
  }

  async createFile(
    parentPath: string,
    name: string,
    mimeType: string,
    bytes: Uint8Array
  ): Promise<GoogleDriveWorkspaceEntry> {
    const parent = await this.resolveDirectory(parentPath)
    const file = await this.client.createFile(name, parent.id, mimeType, bytes)
    return { ...file, path: joinPath(parentPath, file.name), kind: entryKind(file) }
  }

  /** Creates a file once per durable operation ID, including after a lost HTTP ACK. */
  async createFileOnce(
    operationId: string,
    path: string,
    mimeType: string,
    bytes: Uint8Array
  ): Promise<GoogleDriveWorkspaceEntry> {
    const { parentPath, name } = splitItemPath(path)
    const parent = await this.resolveDirectory(parentPath)
    const digest = await sha256Hex(
      concatBytes(
        new TextEncoder().encode(
          JSON.stringify({ kind: 'file', rootId: this.rootId, parentId: parent.id, name, mimeType })
        ),
        new Uint8Array([0]),
        bytes
      )
    )
    const existing = await this.findCreatedItem(operationId)
    if (existing) return this.validateCreatedItem(existing, parent.id, name, mimeType, digest, path)

    const appProperties = this.createOperationProperties(operationId, digest)
    try {
      const file = await this.client.createFile(name, parent.id, mimeType, bytes, appProperties)
      return { ...file, path, kind: entryKind(file) }
    } catch (cause) {
      const recovered = await this.findCreatedItem(operationId).catch(() => null)
      if (recovered)
        return this.validateCreatedItem(recovered, parent.id, name, mimeType, digest, path)
      throw cause
    }
  }

  async writeFile(fileId: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    const current = await this.client.getFile(fileId)
    if (current.trashed || current.mimeType === FOLDER_MIME)
      throw new Error('The requested Drive item cannot be written as a file.')
    return this.client.uploadMedia(fileId, bytes, mimeType)
  }

  async rename(fileId: string, name: string): Promise<DriveFile> {
    const current = await this.client.getFile(fileId)
    if (current.trashed || !name.trim() || name.includes('/'))
      throw new Error('The requested Drive item name is invalid.')
    return this.client.updateFileMetadata(fileId, { name })
  }

  async move(fileId: string, targetDirectoryPath: string): Promise<DriveFile> {
    const [current, target] = await Promise.all([
      this.client.getFile(fileId),
      this.resolveDirectory(targetDirectoryPath)
    ])
    if (current.trashed || current.id === this.rootId)
      throw new Error('The workspace root cannot be moved.')
    if (current.mimeType === FOLDER_MIME) {
      const tree = await this.listTree()
      const currentPath = tree.find((entry) => entry.id === fileId)?.path
      if (
        currentPath &&
        (targetDirectoryPath === currentPath || targetDirectoryPath.startsWith(`${currentPath}/`))
      )
        throw new Error('A folder cannot be moved into itself or one of its descendants.')
    }
    const oldParent = current.parents?.[0]
    if (!oldParent) throw new Error('The Drive item has no parent and cannot be moved.')
    return this.client.updateFileMetadata(
      fileId,
      {},
      { addParents: target.id, removeParents: oldParent }
    )
  }

  async trash(fileId: string): Promise<DriveFile> {
    if (fileId === this.rootId) throw new Error('The workspace root cannot be trashed here.')
    return this.client.trashFile(fileId)
  }

  async ensureProtocolFolder(name: string): Promise<DriveFile> {
    if (!name.startsWith('.'))
      throw new Error('Protocol folders must use a reserved dot-prefix name.')
    return this.client.ensureFolder(name, this.rootId)
  }

  private createOperationProperties(operationId: string, digest: string): Record<string, string> {
    if (!operationId.trim()) throw new Error('A Google Drive operation ID is required.')
    return {
      pkmsWorkspaceRootId: this.rootId,
      pkmsCreateOperationId: operationId,
      pkmsCreatePayloadSha256: digest
    }
  }

  private async findCreatedItem(operationId: string): Promise<DriveFile | null> {
    if (!operationId.trim()) throw new Error('A Google Drive operation ID is required.')
    const matches = await this.client.listFiles({
      query: `appProperties has { key='pkmsWorkspaceRootId' and value=${queryLiteral(this.rootId)} } and appProperties has { key='pkmsCreateOperationId' and value=${queryLiteral(operationId)} } and (trashed = true or trashed = false)`,
      pageSize: 100,
      fields:
        'id,name,mimeType,parents,modifiedTime,md5Checksum,size,trashed,appProperties,webViewLink'
    })
    if (matches.length > 1)
      throw new Error(
        `Google Drive create operation ${operationId} has duplicate materializations.`
      )
    return matches[0] ?? null
  }

  private validateCreatedItem(
    file: DriveFile,
    parentId: string,
    name: string,
    mimeType: string,
    digest: string,
    path: string
  ): GoogleDriveWorkspaceEntry {
    if (
      file.appProperties?.pkmsWorkspaceRootId !== this.rootId ||
      !file.parents?.includes(parentId) ||
      file.name !== name ||
      file.mimeType !== mimeType ||
      file.appProperties?.pkmsCreatePayloadSha256 !== digest
    )
      throw new Error('Google Drive create operation ID collision or changed payload.')
    return { ...file, path, kind: entryKind(file) }
  }

  private async resolveDirectory(path: string): Promise<DriveFile> {
    let directory = await this.getRoot()
    if (!path) return directory
    for (const name of path.split('/')) {
      if (!name || name === '.' || name === '..') throw new Error('Invalid Drive workspace path.')
      const children = await this.client.listChildren(directory.id)
      const matches = children.filter((file) => file.name === name && file.mimeType === FOLDER_MIME)
      if (matches.length !== 1)
        throw new Error(
          matches.length ? `Folder path is ambiguous: ${path}` : `Folder does not exist: ${path}`
        )
      directory = matches[0]
    }
    return directory
  }
}
