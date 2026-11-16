import {
  DriveApiError,
  GoogleDriveClient,
  type DriveFile,
  type DriveFilePage
} from './googleDriveClient'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class GoogleDriveWorkspaceItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`PKMS item does not exist in this Google Drive workspace: ${itemId}`)
    this.name = 'GoogleDriveWorkspaceItemNotFoundError'
  }
}
const INTERNAL_DIRECTORY = '.pkms-sync'
const WORKSPACE_ROOT_MARKER = { pkmsWorkspace: 'pkms-google-drive-v1' }

/** Discovers marked roots and safely recovers roots created by early builds without markers. */
export async function listGoogleDriveWorkspaceRoots(
  client: GoogleDriveClient
): Promise<DriveFile[]> {
  const markedRoots = await client.listFiles({
    query: `mimeType = '${FOLDER_MIME}' and trashed = false and appProperties has { key='pkmsWorkspace' and value='${WORKSPACE_ROOT_MARKER.pkmsWorkspace}' }`,
    pageSize: 100,
    fields: 'id,name,mimeType,parents,trashed,appProperties,webViewLink'
  })
  const roots = new Map(markedRoots.map((root) => [root.id, root]))
  if (markedRoots.length) return [...roots.values()]

  // A few prototype builds created the root before persisting its marker. Only
  // recover an app-owned Drive root with PKMS protocol artifacts beneath it.
  const candidates = await client.listFiles({
    query: `name = 'PKMS' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    pageSize: 100,
    fields: 'id,name,mimeType,parents,trashed,appProperties,webViewLink'
  })
  for (const root of candidates) {
    const children = await client.listChildren(root.id)
    if (
      children.some(
        (child) =>
          child.name === INTERNAL_DIRECTORY || child.appProperties?.pkmsWorkspaceRootId === root.id
      )
    ) {
      const repaired = await client.updateFileMetadata(root.id, {
        appProperties: WORKSPACE_ROOT_MARKER
      })
      roots.set(root.id, repaired)
    }
  }
  return [...roots.values()]
}

/** Finds the unique app-owned root across devices, or creates it if none exists. */
export async function resolveGoogleDriveWorkspaceRoot(
  client: GoogleDriveClient,
  pinnedRootId?: string
): Promise<DriveFile> {
  if (pinnedRootId) {
    const pinned = await client.getFile(pinnedRootId)
    if (pinned.trashed || pinned.mimeType !== FOLDER_MIME)
      throw new Error('The pinned Google Drive workspace root is unavailable.')
    if (pinned.appProperties?.pkmsWorkspace === WORKSPACE_ROOT_MARKER.pkmsWorkspace) return pinned
    if (pinned.appProperties?.pkmsWorkspace)
      throw new Error('The pinned Google Drive folder belongs to a different application.')
    const roots = await listGoogleDriveWorkspaceRoots(client)
    const recovered = roots.find((root) => root.id === pinned.id)
    if (!recovered) throw new Error('The pinned folder is not a PKMS Google Drive workspace.')
    return recovered
  }

  const roots = await listGoogleDriveWorkspaceRoots(client)
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

export interface GoogleDriveWorkspaceSearchPage {
  entries: GoogleDriveWorkspaceEntry[]
  nextPageToken?: string
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

function workspaceItemId(file: DriveFile): string {
  return file.appProperties?.pkmsItemId || file.id
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
 * Drive IDs back existing items; app-owned creates expose a stable PKMS item ID.
 * Paths are derived from Drive parent IDs and names.
 */
export class GoogleDriveWorkspaceRepository {
  private readonly resolvedDriveFiles = new Map<string, DriveFile>()

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
    return this.listDirectoryContents(parent.id, path)
  }

  /** Lists one tree branch by stable item ID without scanning unrelated folders. */
  async listDirectoryById(parentItemId: string | null): Promise<GoogleDriveWorkspaceEntry[]> {
    if (parentItemId === null || parentItemId === this.rootId)
      return this.listDirectoryContents(this.rootId, '')
    const parent = await this.resolveDriveFile(parentItemId)
    if (parent.trashed || parent.mimeType !== FOLDER_MIME)
      throw new Error('The requested Google Drive tree parent is not a folder.')
    const path = await this.pathWithinWorkspace(parent)
    if (path === null) throw new Error('The requested folder is outside this PKMS workspace.')
    return this.listDirectoryContents(parent.id, path)
  }

  /**
   * Searches Drive's indexed text, then restricts results to Markdown descendants
   * of this workspace root. Drive fullText matching is token/phrase based.
   */
  async searchFullTextPage(
    query: string,
    options: { pageToken?: string; pageSize?: number; signal?: AbortSignal } = {}
  ): Promise<GoogleDriveWorkspaceSearchPage> {
    const page: DriveFilePage = await this.client.searchFullTextPage(query, options)
    const resolved = await Promise.all(
      page.files.map(async (file) => {
        if (file.trashed || entryKind(file) !== 'markdown') return null
        const path = await this.pathWithinWorkspace(file, options.signal)
        if (path === null) return null
        return { ...file, id: workspaceItemId(file), path, kind: 'markdown' as const }
      })
    )
    return {
      entries: resolved.flatMap((entry) => (entry ? [entry] : [])),
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {})
    }
  }

  async getEntry(itemId: string): Promise<GoogleDriveWorkspaceEntry> {
    const file = await this.resolveDriveFile(itemId)
    if (file.id === this.rootId)
      return { ...file, id: workspaceItemId(file), path: '', kind: 'folder' }
    const path = await this.pathWithinWorkspace(file)
    if (path === null) throw new Error('The requested item is outside this PKMS workspace.')
    return { ...file, id: workspaceItemId(file), path, kind: entryKind(file) }
  }

  private async listDirectoryContents(
    parentDriveId: string,
    parentPath: string
  ): Promise<GoogleDriveWorkspaceEntry[]> {
    const children = await this.client.listChildren(parentDriveId)
    return children
      .filter((file) => !(parentPath === '' && file.name === INTERNAL_DIRECTORY))
      .map((file) => ({
        ...file,
        id: workspaceItemId(file),
        path: joinPath(parentPath, file.name),
        kind: entryKind(file)
      }))
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
            result.push({ ...file, id: workspaceItemId(file), path, kind: entryKind(file) })
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
    const metadata = await this.resolveDriveFile(fileId)
    if (metadata.trashed || metadata.mimeType === FOLDER_MIME)
      throw new Error('The requested Drive item is not a readable file.')
    return { metadata, bytes: await this.client.download(metadata.id) }
  }

  async createFolder(parentPath: string, name: string): Promise<GoogleDriveWorkspaceEntry> {
    const parent = await this.resolveDirectory(parentPath)
    const folder = await this.client.createFolder(name, parent.id)
    return { ...folder, path: joinPath(parentPath, folder.name), kind: 'folder' }
  }

  /** Creates a folder once per durable operation ID, including after a lost HTTP ACK. */
  async createFolderOnce(
    operationId: string,
    path: string,
    itemId = operationId
  ): Promise<GoogleDriveWorkspaceEntry> {
    const { parentPath, name } = splitItemPath(path)
    const digest = await sha256Hex(
      new TextEncoder().encode(
        JSON.stringify({ kind: 'folder', rootId: this.rootId, parentPath, itemId, name })
      )
    )
    const existing = await this.findCreatedItem(operationId)
    if (existing) return this.validateCreatedItem(existing, FOLDER_MIME, digest, itemId)

    const parent = await this.resolveDirectory(parentPath)
    const appProperties = this.createOperationProperties(operationId, itemId, digest)
    try {
      const folder = await this.client.createFolder(name, parent.id, appProperties)
      this.resolvedDriveFiles.set(itemId, folder)
      return { ...folder, id: itemId, path, kind: 'folder' }
    } catch (cause) {
      const recovered = await this.findCreatedItem(operationId).catch(() => null)
      if (recovered) return this.validateCreatedItem(recovered, FOLDER_MIME, digest, itemId)
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
    bytes: Uint8Array,
    itemId = operationId
  ): Promise<GoogleDriveWorkspaceEntry> {
    const { parentPath, name } = splitItemPath(path)
    const digest = await sha256Hex(
      concatBytes(
        new TextEncoder().encode(
          JSON.stringify({
            kind: 'file',
            rootId: this.rootId,
            parentPath,
            itemId,
            name,
            mimeType
          })
        ),
        new Uint8Array([0]),
        bytes
      )
    )
    const existing = await this.findCreatedItem(operationId)
    if (existing) return this.validateCreatedItem(existing, mimeType, digest, itemId)

    const parent = await this.resolveDirectory(parentPath)
    const appProperties = this.createOperationProperties(operationId, itemId, digest)
    try {
      const file = await this.client.createFile(name, parent.id, mimeType, bytes, appProperties)
      this.resolvedDriveFiles.set(itemId, file)
      return { ...file, id: itemId, path, kind: entryKind(file) }
    } catch (cause) {
      const recovered = await this.findCreatedItem(operationId).catch(() => null)
      if (recovered) return this.validateCreatedItem(recovered, mimeType, digest, itemId)
      throw cause
    }
  }

  async writeFile(fileId: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    const current = await this.resolveDriveFile(fileId)
    if (current.trashed || current.mimeType === FOLDER_MIME)
      throw new Error('The requested Drive item cannot be written as a file.')
    return this.client.uploadMedia(current.id, bytes, mimeType)
  }

  async rename(fileId: string, name: string): Promise<DriveFile> {
    const current = await this.resolveDriveFile(fileId)
    if (current.trashed || !name.trim() || name.includes('/'))
      throw new Error('The requested Drive item name is invalid.')
    if (current.name === name) return current
    return this.client.updateFileMetadata(current.id, { name })
  }

  async move(fileId: string, targetDirectoryPath: string): Promise<DriveFile> {
    const [current, target] = await Promise.all([
      this.resolveDriveFile(fileId),
      this.resolveDirectory(targetDirectoryPath)
    ])
    if (current.trashed || current.id === this.rootId)
      throw new Error('The workspace root cannot be moved.')
    if (current.mimeType === FOLDER_MIME) {
      const [currentPath, targetPath] = await Promise.all([
        this.pathWithinWorkspace(current),
        this.pathWithinWorkspace(target)
      ])
      if (
        currentPath &&
        targetPath &&
        (targetPath === currentPath || targetPath.startsWith(`${currentPath}/`))
      )
        throw new Error('A folder cannot be moved into itself or one of its descendants.')
    }
    if (current.parents?.includes(target.id)) return current
    const oldParent = current.parents?.[0]
    if (!oldParent) throw new Error('The Drive item has no parent and cannot be moved.')
    return this.client.updateFileMetadata(
      current.id,
      {},
      { addParents: target.id, removeParents: oldParent }
    )
  }

  async trash(fileId: string): Promise<DriveFile> {
    const current = await this.resolveDriveFile(fileId)
    if (current.id === this.rootId) throw new Error('The workspace root cannot be trashed here.')
    if (current.trashed) return current
    return this.client.trashFile(current.id)
  }

  /** Replayed delete intent is satisfied when the item has already left this workspace. */
  async trashIfPresent(fileId: string): Promise<void> {
    try {
      await this.trash(fileId)
    } catch (cause) {
      if (cause instanceof GoogleDriveWorkspaceItemNotFoundError) return
      throw cause
    }
  }

  async ensureProtocolFolder(name: string): Promise<DriveFile> {
    if (!name.startsWith('.'))
      throw new Error('Protocol folders must use a reserved dot-prefix name.')
    return this.client.ensureFolder(name, this.rootId)
  }

  private createOperationProperties(
    operationId: string,
    itemId: string,
    digest: string
  ): Record<string, string> {
    if (!operationId.trim()) throw new Error('A Google Drive operation ID is required.')
    if (!itemId.trim()) throw new Error('A stable Google Drive item ID is required.')
    return {
      pkmsWorkspaceRootId: this.rootId,
      pkmsCreateOperationId: operationId,
      pkmsItemId: itemId,
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

  private async validateCreatedItem(
    file: DriveFile,
    mimeType: string,
    digest: string,
    itemId: string
  ): Promise<GoogleDriveWorkspaceEntry> {
    if (
      file.appProperties?.pkmsWorkspaceRootId !== this.rootId ||
      file.appProperties?.pkmsItemId !== itemId ||
      file.mimeType !== mimeType ||
      file.appProperties?.pkmsCreatePayloadSha256 !== digest
    )
      throw new Error('Google Drive create operation ID collision or changed payload.')
    const path = await this.pathWithinWorkspace(file)
    if (path === null) throw new Error('The created Drive item is outside this PKMS workspace.')
    this.resolvedDriveFiles.set(itemId, file)
    return { ...file, id: itemId, path, kind: entryKind(file) }
  }

  /** Resolves either a native Drive ID or an app-stable PKMS item ID. */
  async resolveDriveFile(itemId: string): Promise<DriveFile> {
    let file: DriveFile
    const cached = this.resolvedDriveFiles.get(itemId)
    if (cached) {
      try {
        file = await this.client.getFile(cached.id)
      } catch (cause) {
        // Drive has created this item, but its appProperties search index may
        // not yet expose the stable PKMS ID. The native ID from create is
        // authoritative for this repository session.
        if (cause instanceof DriveApiError && cause.status === 404) file = cached
        else throw cause
      }
    } else {
      try {
        file = await this.client.getFile(itemId)
      } catch (cause) {
        if (!(cause instanceof DriveApiError) || cause.status !== 404) throw cause
        const matches = (
          await this.client.listFiles({
            query: `appProperties has { key='pkmsWorkspaceRootId' and value=${queryLiteral(this.rootId)} } and appProperties has { key='pkmsItemId' and value=${queryLiteral(itemId)} } and trashed = false`,
            pageSize: 100,
            fields:
              'id,name,mimeType,parents,modifiedTime,md5Checksum,size,trashed,appProperties,webViewLink'
          })
        ).filter((match) => !match.trashed && !match.appProperties?.pkmsOperationId)
        const visibleMatches = (
          await Promise.all(
            matches.map(async (match) => ({
              match,
              path: await this.pathWithinWorkspace(match)
            }))
          )
        )
          .filter(
            ({ path }) =>
              path !== null &&
              path !== INTERNAL_DIRECTORY &&
              !path.startsWith(`${INTERNAL_DIRECTORY}/`)
          )
          .map(({ match }) => match)
        if (visibleMatches.length === 0) throw new GoogleDriveWorkspaceItemNotFoundError(itemId)
        if (visibleMatches.length > 1) throw new Error(`PKMS item identity is ambiguous: ${itemId}`)
        return visibleMatches[0]
      }
    }
    if (file.id === this.rootId) return file
    if (file.appProperties?.pkmsWorkspaceRootId)
      if (file.appProperties.pkmsWorkspaceRootId !== this.rootId)
        throw new Error('The requested Drive item belongs to another PKMS workspace.')
    if ((await this.pathWithinWorkspace(file)) !== null) {
      const stableId = file.appProperties?.pkmsItemId
      if (stableId) this.resolvedDriveFiles.set(stableId, file)
      return file
    }
    throw new Error('The requested Drive item is outside this PKMS workspace.')
  }

  private async pathWithinWorkspace(file: DriveFile, signal?: AbortSignal): Promise<string | null> {
    const segments = [file.name]
    let parentId = file.parents?.[0]
    const visited = new Set<string>()
    while (parentId && parentId !== this.rootId) {
      if (visited.has(parentId)) return null
      visited.add(parentId)
      let parent: DriveFile
      try {
        parent = await this.client.getFile(parentId, signal)
      } catch (cause) {
        if (cause instanceof DriveApiError && cause.status === 404) return null
        throw cause
      }
      if (parent.mimeType !== FOLDER_MIME) return null
      segments.unshift(parent.name)
      parentId = parent.parents?.[0]
    }
    return parentId === this.rootId ? segments.join('/') : null
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
