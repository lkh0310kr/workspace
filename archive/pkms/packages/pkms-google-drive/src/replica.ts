import {
  applyDriveChanges,
  type DriveChange,
  type DriveFile,
  type GoogleDriveClient
} from './googleDriveClient'

export interface CachedDriveEntry {
  workspaceRootId: string
  file: DriveFile
  bytes?: Uint8Array
  remoteDeleted?: boolean
  cachedAt: number
}

export interface GoogleDriveReplicaStore {
  getCursor(workspaceRootId: string): Promise<string | null>
  saveCursor(workspaceRootId: string, cursor: string): Promise<void>
  getEntry(workspaceRootId: string, fileId: string): Promise<CachedDriveEntry | null>
  listEntries(workspaceRootId: string): Promise<CachedDriveEntry[]>
  saveEntry(entry: CachedDriveEntry): Promise<void>
  removeEntry(workspaceRootId: string, fileId: string): Promise<void>
}

function recordKey(rootId: string, fileId: string): string {
  return `${rootId}:${fileId}`
}

/** Durable Web/Electron replica metadata, on-demand content cache, and Drive cursor. */
export class IndexedDbGoogleDriveReplica implements GoogleDriveReplicaStore {
  private database?: Promise<IDBDatabase>

  constructor(private readonly databaseName = 'pkms-google-drive-replica') {}

  async getCursor(workspaceRootId: string): Promise<string | null> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const request = database
        .transaction('cursors', 'readonly')
        .objectStore('cursors')
        .get(workspaceRootId)
      request.onsuccess = () =>
        resolve((request.result as { cursor?: string } | undefined)?.cursor ?? null)
      request.onerror = () => reject(request.error ?? new Error('Could not read the Drive cursor.'))
    })
  }

  async saveCursor(workspaceRootId: string, cursor: string): Promise<void> {
    const database = await this.open()
    await this.write(database, 'cursors', { workspaceRootId, cursor })
  }

  async getEntry(workspaceRootId: string, fileId: string): Promise<CachedDriveEntry | null> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const request = database
        .transaction('entries', 'readonly')
        .objectStore('entries')
        .get(recordKey(workspaceRootId, fileId))
      request.onsuccess = () => resolve((request.result as CachedDriveEntry | undefined) ?? null)
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read the Drive replica cache.'))
    })
  }

  async listEntries(workspaceRootId: string): Promise<CachedDriveEntry[]> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const request = database
        .transaction('entries', 'readonly')
        .objectStore('entries')
        .index('workspaceRootId')
        .getAll(workspaceRootId)
      request.onsuccess = () => resolve(request.result as CachedDriveEntry[])
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read the Drive replica cache.'))
    })
  }

  async saveEntry(entry: CachedDriveEntry): Promise<void> {
    const database = await this.open()
    await this.write(database, 'entries', {
      ...entry,
      key: recordKey(entry.workspaceRootId, entry.file.id)
    })
  }

  async removeEntry(workspaceRootId: string, fileId: string): Promise<void> {
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('entries', 'readwrite')
      transaction.objectStore('entries').delete(recordKey(workspaceRootId, fileId))
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not remove the Drive replica entry.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not remove the Drive replica entry.'))
    })
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest
      try {
        request = indexedDB.open(this.databaseName, 2)
      } catch (cause) {
        reject(cause)
        return
      }
      request.onupgradeneeded = () => {
        const database = request.result
        const entries = database.objectStoreNames.contains('entries')
          ? request.transaction!.objectStore('entries')
          : database.createObjectStore('entries', { keyPath: 'key' })
        if (!entries.indexNames.contains('workspaceRootId'))
          entries.createIndex('workspaceRootId', 'workspaceRootId')
        if (!database.objectStoreNames.contains('cursors'))
          database.createObjectStore('cursors', { keyPath: 'workspaceRootId' })
      }
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open Drive replica storage.'))
      request.onblocked = () =>
        reject(new Error('Drive replica storage is blocked by another open connection.'))
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          this.database = undefined
        }
        resolve(database)
      }
    }).catch((cause) => {
      this.database = undefined
      throw cause
    })
    return this.database!
  }

  private write(
    database: IDBDatabase,
    storeName: 'entries' | 'cursors',
    value: object
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(value)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not persist Drive replica state.'))
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not persist Drive replica state.'))
    })
  }
}

/** Deterministic storage adapter for tests and non-browser platform implementations. */
export class MemoryGoogleDriveReplica implements GoogleDriveReplicaStore {
  private readonly cursors = new Map<string, string>()
  private readonly entries = new Map<string, CachedDriveEntry>()

  async getCursor(rootId: string): Promise<string | null> {
    return this.cursors.get(rootId) ?? null
  }

  async saveCursor(rootId: string, cursor: string): Promise<void> {
    this.cursors.set(rootId, cursor)
  }

  async getEntry(rootId: string, fileId: string): Promise<CachedDriveEntry | null> {
    const entry = this.entries.get(recordKey(rootId, fileId))
    return entry ? structuredClone(entry) : null
  }

  async listEntries(rootId: string): Promise<CachedDriveEntry[]> {
    return [...this.entries.values()]
      .filter((entry) => entry.workspaceRootId === rootId)
      .map((entry) => structuredClone(entry))
  }

  async saveEntry(entry: CachedDriveEntry): Promise<void> {
    this.entries.set(recordKey(entry.workspaceRootId, entry.file.id), structuredClone(entry))
  }

  async removeEntry(rootId: string, fileId: string): Promise<void> {
    this.entries.delete(recordKey(rootId, fileId))
  }
}

/** Apply Drive metadata changes and cached bytes before advancing the durable cursor. */
export async function syncDriveChanges(options: {
  client: Pick<GoogleDriveClient, 'listChangesPage' | 'getFile' | 'download'>
  store: GoogleDriveReplicaStore
  workspaceRootId: string
  hasPendingMutation: (fileId: string) => Promise<boolean>
  cursor?: string
  signal?: AbortSignal
}): Promise<{ cursor: string; changesApplied: number; pages: number }> {
  const cursor = options.cursor ?? (await options.store.getCursor(options.workspaceRootId))
  if (!cursor) throw new Error('Initialize the Drive change cursor before polling changes.')

  const applyRemoteDeletion = async (fileId: string) => {
    const entries = await options.store.listEntries(options.workspaceRootId)
    const deletedIds = new Set([fileId])
    let changed = true
    while (changed) {
      changed = false
      for (const entry of entries) {
        if (
          !deletedIds.has(entry.file.id) &&
          entry.file.parents?.some((parent) => deletedIds.has(parent))
        ) {
          deletedIds.add(entry.file.id)
          changed = true
        }
      }
    }
    for (const deletedId of deletedIds) {
      if (await options.hasPendingMutation(deletedId)) {
        const cached = await options.store.getEntry(options.workspaceRootId, deletedId)
        if (cached)
          await options.store.saveEntry({ ...cached, remoteDeleted: true, cachedAt: Date.now() })
      } else {
        await options.store.removeEntry(options.workspaceRootId, deletedId)
      }
    }
  }

  return applyDriveChanges({
    client: options.client,
    cursor,
    signal: options.signal,
    apply: async (changes: readonly DriveChange[]) => {
      for (const change of changes) {
        if (change.removed) {
          await applyRemoteDeletion(change.fileId)
          continue
        }

        const file = change.file ?? (await options.client.getFile(change.fileId, options.signal))
        if (file.trashed) {
          await applyRemoteDeletion(file.id)
          continue
        }

        const cached = await options.store.getEntry(options.workspaceRootId, file.id)
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
        const bytes =
          cached?.bytes && !isFolder
            ? await options.client.download(file.id, options.signal)
            : cached?.bytes
        await options.store.saveEntry({
          workspaceRootId: options.workspaceRootId,
          file,
          ...(bytes ? { bytes } : {}),
          cachedAt: Date.now()
        })
      }
    },
    saveCursor: (nextCursor) => options.store.saveCursor(options.workspaceRootId, nextCursor)
  })
}
