import { createOperationId } from '../domain/encoding'
import type { Workspace } from '../domain/types'
import {
  queueWorkspaceOperation,
  readQueuedWorkspaceOperations,
  removeQueuedWorkspaceOperation,
  type QueuedWorkspaceOperation,
  queueWorkspaceAsset,
  readQueuedWorkspaceAssets,
  removeQueuedWorkspaceAsset,
  type QueuedWorkspaceAsset
} from './workspaceTreeCache'

type Api = <T = unknown>(path: string, init?: RequestInit) => Promise<T>
export const WORKSPACE_OPERATION_QUEUE_EVENT = 'pkms:workspace-operation-queue'
const flushes = new Map<string, Promise<boolean>>()
const assetFlushes = new Map<string, Promise<boolean>>()
let operationSequence = 0

export type WorkspaceFileOperation =
  | { type: 'create-file'; path: string; fileId: string; content: string }
  | { type: 'create-folder'; path: string }
  | { type: 'move'; fileId: string; toPath: string }
  | { type: 'delete'; fileId: string; expectedRevision?: number; protectSubtree?: boolean }

export interface WorkspaceOperationResult {
  acceptedRevision?: number
  conflictCopyPath?: string
  queued?: boolean
  links?: { updated: number; failed?: boolean; truncated?: boolean }
  operationId?: string
}

function isConnectivityFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error instanceof TypeError) return true
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; message?: unknown }
  if (typeof value.code === 'string' && value.code) return false
  return (
    typeof value.message === 'string' &&
    /network|fetch|offline|connection|transport|timed? ?out/i.test(value.message)
  )
}

function notifyQueue(detail: Record<string, unknown>): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(WORKSPACE_OPERATION_QUEUE_EVENT, { detail }))
}

function operationRequest(operation: QueuedWorkspaceOperation): {
  path: string
  init: RequestInit
} {
  return {
    path: `/api/workspaces/${encodeURIComponent(operation.workspaceId)}/operations`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId: operation.operationId,
        baseRevision: operation.baseRevision,
        clientId: operation.clientId,
        operation: operation.operation
      })
    }
  }
}

function newQueuedOperation(
  workspace: Pick<Workspace, 'id' | 'revision'>,
  operation: WorkspaceFileOperation,
  clientId?: string
): QueuedWorkspaceOperation {
  const operationId = createOperationId()
  return {
    key: `${workspace.id}:${operationId}`,
    workspaceId: workspace.id,
    operationId,
    baseRevision: workspace.revision,
    clientId: clientId ?? `web-${createOperationId()}`,
    operation,
    queuedAt: Date.now() * 1_000 + operationSequence++
  }
}

/** Send a revisioned file-tree operation using the shared PKMS wire envelope. */
export async function submitWorkspaceOperation(
  api: Api,
  workspace: Pick<Workspace, 'id' | 'revision'>,
  operation: WorkspaceFileOperation,
  clientId = `web-${createOperationId()}`
): Promise<WorkspaceOperationResult> {
  const queued = newQueuedOperation(workspace, operation, clientId)
  let stored = false
  try {
    await queueWorkspaceOperation(queued)
    stored = true
  } catch {
    /* Keep online mutations usable when local storage is unavailable. */
  }
  const request = operationRequest(queued)
  try {
    const result = await api<WorkspaceOperationResult>(request.path, request.init)
    if (stored)
      void removeQueuedWorkspaceOperation(workspace.id, queued.operationId).catch(() => {})
    return { ...result, operationId: queued.operationId }
  } catch (error) {
    if (stored && isConnectivityFailure(error)) {
      notifyQueue({ state: 'queued', workspaceId: workspace.id, operationId: queued.operationId })
      return { queued: true, operationId: queued.operationId }
    }
    if (stored)
      void removeQueuedWorkspaceOperation(workspace.id, queued.operationId).catch(() => {})
    throw error
  }
}

/** Replay durable optimistic operations in original order once the API is reachable. */
export function flushQueuedWorkspaceOperations(workspaceId: string, api: Api): Promise<boolean> {
  const active = flushes.get(workspaceId)
  if (active) return active
  const flush = (async () => {
    const queued = await readQueuedWorkspaceOperations(workspaceId)
    const rejected: Array<{ operation: QueuedWorkspaceOperation; message: string }> = []
    for (const operation of queued) {
      const request = operationRequest(operation)
      try {
        const result = await api<WorkspaceOperationResult>(request.path, request.init)
        await removeQueuedWorkspaceOperation(workspaceId, operation.operationId)
        notifyQueue({ state: 'applied', workspaceId, operation: operation.operation, result })
      } catch (error) {
        if (isConnectivityFailure(error)) break
        await removeQueuedWorkspaceOperation(workspaceId, operation.operationId).catch(() => {})
        rejected.push({
          operation,
          message: error instanceof Error ? error.message : 'Local change could not be synced.'
        })
      }
    }
    const remaining = await readQueuedWorkspaceOperations(workspaceId).catch(() => [])
    for (const item of rejected)
      notifyQueue({
        state: 'rejected',
        workspaceId,
        operation: item.operation.operation,
        message: item.message,
        hasPending: remaining.length > 0
      })
    return remaining.length === 0
  })().finally(() => flushes.delete(workspaceId))
  flushes.set(workspaceId, flush)
  return flush
}

function assetForm(asset: QueuedWorkspaceAsset): FormData {
  const form = new FormData()
  form.set('file', new File([asset.blob], asset.fileName, { type: asset.contentType }))
  form.set('path', asset.path)
  form.set('fileId', asset.fileId)
  form.set('clientId', asset.clientId)
  return form
}

export async function submitWorkspaceAsset(
  api: Api,
  workspaceId: string,
  file: File,
  path: string,
  fileId: string,
  clientId: string
): Promise<WorkspaceOperationResult & { path?: string }> {
  const asset: QueuedWorkspaceAsset = {
    key: `${workspaceId}:${fileId}`,
    workspaceId,
    fileId,
    path,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    blob: file.slice(0, file.size, file.type),
    clientId,
    queuedAt: Date.now() * 1_000 + operationSequence++
  }
  let stored = false
  try {
    await queueWorkspaceAsset(asset)
    stored = true
  } catch {
    /* Large or quota-limited files still upload when online. */
  }
  try {
    const result = await api<WorkspaceOperationResult & { path?: string }>(
      `/api/workspaces/${workspaceId}/upload`,
      { method: 'POST', body: assetForm(asset) }
    )
    if (stored) void removeQueuedWorkspaceAsset(workspaceId, fileId).catch(() => {})
    return result
  } catch (error) {
    if (stored && isConnectivityFailure(error)) {
      notifyQueue({ state: 'queued', kind: 'asset', workspaceId, fileId })
      return { queued: true, path, operationId: fileId }
    }
    if (stored) void removeQueuedWorkspaceAsset(workspaceId, fileId).catch(() => {})
    throw error
  }
}

/** Upload cached attachment bytes after pending folders and file operations have been replayed. */
export function flushQueuedWorkspaceAssets(workspaceId: string, api: Api): Promise<boolean> {
  const active = assetFlushes.get(workspaceId)
  if (active) return active
  const flush = (async () => {
    const queued = await readQueuedWorkspaceAssets(workspaceId)
    const rejected: Array<{ asset: QueuedWorkspaceAsset; message: string }> = []
    for (const asset of queued) {
      try {
        const result = await api<WorkspaceOperationResult & { path?: string }>(
          `/api/workspaces/${workspaceId}/upload`,
          { method: 'POST', body: assetForm(asset) }
        )
        await removeQueuedWorkspaceAsset(workspaceId, asset.fileId)
        notifyQueue({
          state: 'applied',
          kind: 'asset',
          workspaceId,
          fileId: asset.fileId,
          path: asset.path,
          result
        })
      } catch (error) {
        if (isConnectivityFailure(error)) break
        await removeQueuedWorkspaceAsset(workspaceId, asset.fileId).catch(() => {})
        rejected.push({
          asset,
          message: error instanceof Error ? error.message : 'Attachment could not be synced.'
        })
      }
    }
    const remaining = await readQueuedWorkspaceAssets(workspaceId).catch(() => [])
    for (const item of rejected)
      notifyQueue({
        state: 'rejected',
        kind: 'asset',
        workspaceId,
        fileId: item.asset.fileId,
        message: item.message,
        hasPending: remaining.length > 0
      })
    return remaining.length === 0
  })().finally(() => assetFlushes.delete(workspaceId))
  assetFlushes.set(workspaceId, flush)
  return flush
}
