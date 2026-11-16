import { randomUUID } from 'node:crypto'
import path from 'node:path'
import * as Y from 'yjs'
import { requestPkmsApi } from './api'

export type BridgeFile = {
  id: string
  path: string
  kind: string
  revision: number
  size?: number
  sha?: string | null
  localHash?: string
}
export type BridgeSnapshotPage = {
  revision: number
  files: BridgeFile[]
  hasMore: boolean
  nextPath: string
}
export type BridgeChange = BridgeFile & { deleted: boolean }

export class PkmsBridgeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code || `PKMS request failed (${status})`)
  }
}
export async function request<T>(
  pathName: string,
  method: 'GET' | 'POST',
  value?: unknown
): Promise<T> {
  const response = await requestPkmsApi<T>(pathName, {
    method,
    ...(value === undefined ? {} : { body: { kind: 'json', value: JSON.stringify(value) } })
  })
  if (response.status < 200 || response.status >= 300) {
    const detail =
      response.body && typeof response.body === 'object'
        ? (response.body as { message?: string; error?: string })
        : {}
    throw new PkmsBridgeRequestError(
      response.status,
      detail.error ?? detail.message ?? `PKMS request failed (${response.status})`
    )
  }
  return response.body
}
export async function uploadAsset(
  workspaceId: string,
  relative: string,
  fileId: string | null,
  expectedRevision: number | null,
  bytes: Uint8Array
): Promise<{ fileId: string; path: string; acceptedRevision: number; conflictCopyPath?: string }> {
  const parts: Array<
    | { name: string; value: string }
    | {
        name: string
        fileName: string
        contentType: string
        bytes: Uint8Array
      }
  > = [
    { name: 'path', value: relative },
    { name: 'clientId', value: 'desktop-sync-bridge' },
    { name: 'operationId', value: randomUUID() },
    {
      name: 'file',
      fileName: path.posix.basename(relative),
      contentType: 'application/octet-stream',
      bytes
    }
  ]
  if (fileId) parts.push({ name: 'fileId', value: fileId })
  if (expectedRevision !== null)
    parts.push({ name: 'expectedRevision', value: String(expectedRevision) })
  const response = await requestPkmsApi<{
    fileId?: string
    path?: string
    acceptedRevision?: number
    conflictCopyPath?: string
    error?: string
    message?: string
  }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/upload`, {
    method: 'POST',
    body: { kind: 'multipart', parts }
  })
  if (response.status < 200 || response.status >= 300)
    throw new PkmsBridgeRequestError(
      response.status,
      response.body?.error ?? response.body?.message ?? 'asset_upload_failed'
    )
  return {
    fileId: response.body.fileId ?? fileId ?? '',
    path: response.body.path ?? response.body.conflictCopyPath ?? relative,
    acceptedRevision: response.body.acceptedRevision ?? 0,
    ...(response.body.conflictCopyPath ? { conflictCopyPath: response.body.conflictCopyPath } : {})
  }
}

export function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
export function fromB64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

export async function readRemoteText(
  workspaceId: string,
  file: BridgeFile
): Promise<{ text: string; revision: number }> {
  const data = await request<{ update: string; revision: number }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`,
    'GET'
  )
  const doc = new Y.Doc({ guid: file.id })
  Y.applyUpdate(doc, fromB64(data.update))
  return { text: doc.getText('markdown').toString(), revision: data.revision }
}
export async function readRemoteTexts(
  workspaceId: string,
  files: BridgeFile[],
  onProgress: (completed: number, total: number) => void
): Promise<{
  documents: Map<string, { text: string; revision: number }>
  missingIds: Set<string>
}> {
  const batches: BridgeFile[][] = []
  const batchSize = 32
  for (let index = 0; index < files.length; index += batchSize)
    batches.push(files.slice(index, index + batchSize))
  const documents = new Map<string, { text: string; revision: number }>()
  const missingIds = new Set<string>()
  let nextBatch = 0
  let completed = 0
  let firstError: unknown
  onProgress(0, files.length)
  const worker = async (): Promise<void> => {
    while (true) {
      if (firstError !== undefined) return
      const batch = batches[nextBatch++]
      if (!batch) return
      try {
        const result = await request<{
          documents: Array<{
            id: string
            path: string
            revision: number
            text?: string
            error?: string
          }>
        }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/sync/download`, 'POST', {
          fileIds: batch.map((file) => file.id)
        })
        const returnedIds = new Set<string>()
        for (const document of result.documents) {
          returnedIds.add(document.id)
          if (document.error === 'not_found') {
            missingIds.add(document.id)
            onProgress(++completed, files.length)
            continue
          }
          if (document.error || typeof document.text !== 'string')
            throw new Error(`${document.error ?? 'document_load_failed'}:${document.id}`)
          documents.set(document.id, { text: document.text, revision: document.revision })
          onProgress(++completed, files.length)
        }
        // A file can disappear between the manifest read and this batch query.
        // Treat omitted rows like tombstones instead of falling back to one GET
        // per file, which turns a stale manifest into minutes of serial traffic.
        for (const file of batch) {
          if (!returnedIds.has(file.id)) {
            missingIds.add(file.id)
            onProgress(++completed, files.length)
          }
        }
      } catch (error) {
        firstError ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  if (firstError !== undefined) throw firstError
  return { documents, missingIds }
}
export async function readRemoteChanges(
  workspaceId: string,
  afterRevision: number
): Promise<{ changes: BridgeChange[]; nextRevision: number }> {
  const changes: BridgeChange[] = []
  let lastRevision = afterRevision
  let lastFileId = ''
  while (true) {
    const query = new URLSearchParams({
      afterRevision: String(afterRevision),
      lastRevision: String(lastRevision),
      lastFileId
    })
    const page = await request<{
      changes: BridgeChange[]
      hasMore: boolean
      nextRevision: number
      lastRevision: number
      lastFileId: string
    }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/sync/changes?${query}`, 'GET')
    changes.push(...page.changes)
    if (!page.hasMore) return { changes, nextRevision: page.nextRevision }
    lastRevision = page.lastRevision
    lastFileId = page.lastFileId
  }
}
export async function readRemoteSnapshot(
  workspaceId: string
): Promise<{ revision: number; files: BridgeFile[] }> {
  const files: BridgeFile[] = []
  let atRevision: number | undefined
  let afterPath = ''
  let legacySnapshot = false
  while (true) {
    const query = new URLSearchParams()
    if (atRevision !== undefined) query.set('atRevision', String(atRevision))
    if (afterPath) query.set('afterPath', afterPath)
    let page: BridgeSnapshotPage
    try {
      page = await request<BridgeSnapshotPage>(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/${legacySnapshot ? 'snapshot' : 'sync/tree'}${query.size ? `?${query}` : ''}`,
        'GET'
      )
    } catch (error) {
      if (
        !legacySnapshot &&
        !files.length &&
        error instanceof Error &&
        error.message === 'not_found'
      ) {
        legacySnapshot = true
        continue
      }
      throw error
    }
    atRevision = page.revision
    files.push(...page.files)
    if (!page.hasMore) {
      if (legacySnapshot) {
        const folders = new Map<string, BridgeFile>()
        for (const file of files) {
          let parent = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
          while (parent) {
            if (!folders.has(parent))
              folders.set(parent, {
                id: `folder-${parent}`,
                path: parent,
                kind: 'folder',
                revision: 0
              })
            parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''
          }
        }
        files.push(...folders.values())
      }
      return { files, revision: atRevision }
    }
    afterPath = page.nextPath
  }
}
