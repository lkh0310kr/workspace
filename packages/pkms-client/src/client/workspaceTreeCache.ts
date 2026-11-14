import type { FileRecord } from '../domain/types'

const DATABASE_NAME = 'pkms-workspace-cache'
const DATABASE_VERSION = 3
const TREE_STORE = 'workspace-trees'
const OPERATION_STORE = 'workspace-operations'
const ASSET_STORE = 'workspace-assets'

export interface WorkspaceTreeCache {
  workspaceId: string
  files: FileRecord[]
  loadedFolders: string[]
  savedAt: number
}

export interface QueuedWorkspaceOperation {
  key: string
  workspaceId: string
  operationId: string
  baseRevision: number
  clientId: string
  operation: import('@pkms/protocol/types').PkmsWorkspaceOperation
  queuedAt: number
}

export interface QueuedWorkspaceAsset {
  key: string
  workspaceId: string
  fileId: string
  path: string
  fileName: string
  contentType: string
  size: number
  blob: Blob
  clientId: string
  queuedAt: number
}

let databasePromise: Promise<IDBDatabase> | null = null
const writes = new Map<string, Promise<void>>()

function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(TREE_STORE))
        db.createObjectStore(TREE_STORE, { keyPath: 'workspaceId' })
      if (!db.objectStoreNames.contains(OPERATION_STORE))
        db.createObjectStore(OPERATION_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(ASSET_STORE))
        db.createObjectStore(ASSET_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local workspace cache'))
  })
  const pending = opening.catch((error: unknown) => {
    databasePromise = null
    throw error
  })
  databasePromise = pending
  return pending
}

export async function readWorkspaceTree(workspaceId: string): Promise<WorkspaceTreeCache | null> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction(TREE_STORE, 'readonly').objectStore(TREE_STORE).get(workspaceId)
    request.onsuccess = () => resolve((request.result as WorkspaceTreeCache | undefined) ?? null)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read local workspace cache'))
  })
}

export function writeWorkspaceTree(cache: WorkspaceTreeCache): Promise<void> {
  const previous = writes.get(cache.workspaceId) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      const db = await database()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(TREE_STORE, 'readwrite')
        transaction.objectStore(TREE_STORE).put({ ...cache, savedAt: Date.now() })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Could not save local workspace cache'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Local workspace cache write was aborted'))
      })
    })
  writes.set(cache.workspaceId, next)
  void next
    .finally(() => {
      if (writes.get(cache.workspaceId) === next) writes.delete(cache.workspaceId)
    })
    .catch(() => {})
  return next
}

export async function queueWorkspaceOperation(operation: QueuedWorkspaceOperation): Promise<void> {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(OPERATION_STORE, 'readwrite')
    transaction.objectStore(OPERATION_STORE).put(operation)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not queue local workspace operation'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local workspace operation queue write was aborted'))
  })
}

export async function readQueuedWorkspaceOperations(
  workspaceId: string
): Promise<QueuedWorkspaceOperation[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(OPERATION_STORE, 'readonly')
      .objectStore(OPERATION_STORE)
      .getAll()
    request.onsuccess = () =>
      resolve(
        (request.result as QueuedWorkspaceOperation[])
          .filter((item) => item.workspaceId === workspaceId)
          .sort((a, b) => a.queuedAt - b.queuedAt)
      )
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read local workspace operation queue'))
  })
}

export async function removeQueuedWorkspaceOperation(
  workspaceId: string,
  operationId: string
): Promise<void> {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(OPERATION_STORE, 'readwrite')
    transaction.objectStore(OPERATION_STORE).delete(`${workspaceId}:${operationId}`)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not remove local workspace operation'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local workspace operation removal was aborted'))
  })
}

export async function queueWorkspaceAsset(asset: QueuedWorkspaceAsset): Promise<void> {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE, 'readwrite')
    transaction.objectStore(ASSET_STORE).put(asset)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not cache local attachment'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local attachment cache write was aborted'))
  })
}

export async function readQueuedWorkspaceAssets(
  workspaceId: string
): Promise<QueuedWorkspaceAsset[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE).getAll()
    request.onsuccess = () =>
      resolve(
        (request.result as QueuedWorkspaceAsset[])
          .filter((item) => item.workspaceId === workspaceId)
          .sort((a, b) => a.queuedAt - b.queuedAt)
      )
    request.onerror = () => reject(request.error ?? new Error('Could not read cached attachments'))
  })
}

export async function removeQueuedWorkspaceAsset(
  workspaceId: string,
  fileId: string
): Promise<void> {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE, 'readwrite')
    transaction.objectStore(ASSET_STORE).delete(`${workspaceId}:${fileId}`)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not remove cached attachment'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Cached attachment removal was aborted'))
  })
}

export function sameFileRecords(left: FileRecord[], right: FileRecord[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  const byId = new Map(left.map((file) => [file.id, file]))
  return right.every((file) => {
    const previous = byId.get(file.id)
    if (!previous) return false
    const keys = new Set([...Object.keys(previous), ...Object.keys(file)])
    for (const key of keys)
      if (previous[key as keyof FileRecord] !== file[key as keyof FileRecord]) return false
    return true
  })
}

/** Replace one authoritative directory listing without disturbing other cached folders. */
export function replaceDirectoryEntries(
  current: FileRecord[],
  directory: string,
  incoming: FileRecord[]
): FileRecord[] {
  const incomingByPath = new Map(incoming.map((file) => [file.path, file]))
  const removedFolders = current
    .filter(
      (file) =>
        file.kind === 'folder' &&
        parentPath(file.path) === directory &&
        !incomingByPath.has(file.path)
    )
    .map((file) => file.path)
  const next = current.filter((file) => {
    if (parentPath(file.path) === directory) return false
    return !removedFolders.some((folder) => file.path.startsWith(`${folder}/`))
  })
  const byPath = new Map(next.map((file) => [file.path, file]))
  for (const file of incoming) byPath.set(file.path, file)
  const result = [...byPath.values()]
  return sameFileRecords(current, result) ? current : result
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}
