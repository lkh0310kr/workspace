import { randomUUID } from 'node:crypto'
import { appendStartupLog } from '../startupLog'
import {
  PkmsBridgeRequestError,
  readRemoteSnapshot,
  readRemoteText,
  request
} from './syncBridgeRemote'
import type { BridgeFile } from './syncBridgeRemote'
import type { PkmsSyncItemState } from '../../shared/pkmsSyncBridge'

type MarkdownBaseline = { fileId: string; hash: string; revision: number }
type PendingMarkdownDelete = {
  kind: 'markdown' | 'folder'
  path: string
  fileId: string
  operationId: string
  baseRevision: number
  expectedItemRevision?: number
  firstObservedAt: number
  attempts: number
}
type MarkdownState = {
  baselines: Record<string, Record<string, MarkdownBaseline>>
  pendingDeletes: Record<string, Record<string, PendingMarkdownDelete>>
  pendingUpdates: Record<string, Record<string, { targetHash: string }>>
  remoteTreeVersions: Record<string, number>
}
type MarkdownReconcileContext = {
  workspaceId: string
  root: string
  state: MarkdownState
  local: Map<string, string>
  remoteByPath: Map<string, BridgeFile>
  baselines: Record<string, MarkdownBaseline>
  knownRemoteFiles: Record<string, BridgeFile>
  remoteReads: Map<string, { text: string; revision: number }>
  knownRemoteTree: BridgeFile[] | undefined
  nextSyncRevision: number
  setItemState: (
    workspaceId: string,
    relativePath: string,
    itemState: PkmsSyncItemState | null
  ) => void
  hash: (content: string | Uint8Array) => string
  gitBlobHash: (content: string) => string
  createAndRememberRemoteFile: (relativePath: string, content: string) => Promise<BridgeFile>
  preserveConflictCopy: (relativePath: string, content: string) => Promise<BridgeFile>
  replaceRemoteText: (
    workspaceId: string,
    file: BridgeFile,
    currentRemote: string,
    nextText: string
  ) => Promise<number>
  removeLocalFile: (root: string, relativePath: string, expectedHash: string) => Promise<void>
  localPathIsAbsent: (root: string, relativePath: string) => Promise<boolean>
  remoteChangedSinceBaseline: (
    remote: { id: string; revision: number },
    baseline: MarkdownBaseline
  ) => boolean
  writeAtomic: (
    root: string,
    relativePath: string,
    content: string,
    expectedCurrentHash?: string | null
  ) => Promise<void>
  save: () => Promise<void>
}
export type MarkdownReconcileResult = {
  itemComplete: boolean
  deletionConflictRecovered: boolean
}

export async function reconcileMarkdownPath(
  ctx: MarkdownReconcileContext,
  relative: string
): Promise<MarkdownReconcileResult> {
  const {
    workspaceId,
    root,
    state,
    local,
    remoteByPath,
    baselines,
    knownRemoteFiles,
    remoteReads,
    setItemState,
    hash,
    gitBlobHash,
    createAndRememberRemoteFile,
    preserveConflictCopy,
    replaceRemoteText,
    removeLocalFile,
    localPathIsAbsent,
    remoteChangedSinceBaseline,
    writeAtomic,
    save
  } = ctx
  let itemComplete = false
  let deletionConflictRecovered = false
  setItemState(workspaceId, relative, 'syncing')
  const localText = local.get(relative)
  const remote = remoteByPath.get(relative)
  const baseline = baselines[relative]
  if (!remote && localText !== undefined) {
    if (baseline) {
      if (hash(localText) !== baseline.hash) {
        const created = await preserveConflictCopy(relative, localText)
        baselines[created.path] = {
          fileId: created.id,
          hash: created.localHash ?? hash(localText),
          revision: created.revision
        }
      }
      await removeLocalFile(root, relative, hash(localText))
      delete baselines[relative]
    } else {
      const created = await createAndRememberRemoteFile(relative, localText)
      baselines[created.path] = {
        fileId: created.id,
        hash: created.localHash ?? hash(localText),
        revision: created.revision
      }
    }
    itemComplete = true
    return { itemComplete, deletionConflictRecovered }
  }
  if (!remote) {
    delete baselines[relative]
    const pending = state.pendingDeletes[workspaceId]?.[relative]
    if (pending) {
      delete state.pendingDeletes[workspaceId][relative]
      state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
    }
    itemComplete = true
    return { itemComplete, deletionConflictRecovered }
  }
  if (
    !baseline &&
    remote.revision === 0 &&
    remote.sha &&
    localText !== undefined &&
    gitBlobHash(localText) === remote.sha
  ) {
    baselines[relative] = {
      fileId: remote.id,
      hash: hash(localText),
      revision: remote.revision
    }
    itemComplete = true
    return { itemComplete, deletionConflictRecovered }
  }
  const remoteNeedsRead =
    !baseline || baseline.fileId !== remote.id || baseline.revision !== remote.revision
  const remoteContent = remoteNeedsRead
    ? (remoteReads.get(remote.id) ?? (await readRemoteText(workspaceId, remote)))
    : null
  const remoteText = remoteContent?.text
  const actualLocal = localText
  if (actualLocal === undefined) {
    if (!(await localPathIsAbsent(root, relative))) {
      throw new Error(`A non-file item occupies the synced Markdown path: ${relative}`)
    }
    if (baseline) {
      const remoteChanged = remoteChangedSinceBaseline(
        { id: remote.id, revision: remoteContent?.revision ?? remote.revision },
        baseline
      )
      if (remoteChanged) {
        const latestText = remoteText ?? (await readRemoteText(workspaceId, remote)).text
        // A local deletion is valid only against the exact remote version
        // in its baseline. If the cloud changed, restore that version at
        // its original path and cancel any stale delete intent. Creating
        // a conflict copy and then deleting the source would strand the
        // latest cloud content under a new path and break replica parity.
        await writeAtomic(root, relative, latestText, null)
        baselines[relative] = {
          fileId: remote.id,
          hash: hash(latestText),
          revision: remoteContent?.revision ?? remote.revision
        }
        delete (state.pendingDeletes[workspaceId] ?? {})[relative]
        ctx.nextSyncRevision = Math.max(
          ctx.nextSyncRevision ?? 0,
          remoteContent?.revision ?? remote.revision
        )
        deletionConflictRecovered = true
        itemComplete = true
        appendStartupLog('pkms_local_delete_conflict', {
          workspaceId,
          kind: 'markdown',
          path: relative,
          outcome: 'restored_remote_revision',
          remoteRevision: remoteContent?.revision ?? remote.revision
        })
        return { itemComplete, deletionConflictRecovered }
      }
      const pending = (state.pendingDeletes[workspaceId] ??= {})
      const isNewDeletion = !pending[relative]
      const deletion = (pending[relative] ??= {
        kind: 'markdown',
        path: relative,
        fileId: remote.id,
        operationId: randomUUID(),
        baseRevision: ctx.nextSyncRevision ?? 0,
        expectedItemRevision: remote.revision,
        firstObservedAt: Date.now(),
        attempts: 0
      })
      deletion.attempts++
      if (isNewDeletion)
        state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
      await save()
      appendStartupLog('pkms_local_delete_queued', {
        workspaceId,
        kind: 'markdown',
        path: relative,
        operationId: deletion.operationId
      })
      try {
        const result = await request<{ acceptedRevision?: number }>(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/operations`,
          'POST',
          {
            operationId: deletion.operationId,
            baseRevision: deletion.baseRevision,
            clientId: 'desktop-sync-bridge',
            operation: {
              type: 'delete',
              fileId: remote.id,
              expectedRevision: deletion.expectedItemRevision
            }
          }
        )
        delete pending[relative]
        state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
        delete knownRemoteFiles[remote.id]
        ctx.knownRemoteTree = (ctx.knownRemoteTree ?? []).filter((file) => file.id !== remote.id)
        remoteByPath.delete(relative)
        ctx.nextSyncRevision = Math.max(ctx.nextSyncRevision ?? 0, result.acceptedRevision ?? 0)
        appendStartupLog('pkms_local_delete_ack', {
          workspaceId,
          kind: 'markdown',
          path: relative,
          operationId: deletion.operationId
        })
      } catch (error) {
        if (error instanceof PkmsBridgeRequestError && error.code === 'file_changed_since_base') {
          delete pending[relative]
          state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
          const latestTree = await readRemoteSnapshot(workspaceId)
          const latest = latestTree.files.find(
            (file) => file.path === relative && file.kind === 'markdown'
          )
          if (latest) {
            const text = (await readRemoteText(workspaceId, latest)).text
            await writeAtomic(root, relative, text, null)
            knownRemoteFiles[latest.id] = latest
            ctx.knownRemoteTree = latestTree.files
            baselines[relative] = {
              fileId: latest.id,
              hash: hash(text),
              revision: latest.revision
            }
            ctx.nextSyncRevision = latestTree.revision
          }
          setItemState(workspaceId, relative, 'attention')
          appendStartupLog('pkms_local_delete_conflict', {
            workspaceId,
            kind: 'markdown',
            path: relative,
            operationId: deletion.operationId
          })
          return { itemComplete, deletionConflictRecovered }
        }
        appendStartupLog('pkms_local_delete_retry', {
          workspaceId,
          kind: 'markdown',
          path: relative,
          operationId: deletion.operationId,
          message: error instanceof Error ? error.message : 'unknown'
        })
        throw error
      }
      delete baselines[relative]
    } else {
      const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text
      await writeAtomic(root, relative, text, null)
      baselines[relative] = {
        fileId: remote.id,
        hash: hash(text),
        revision: remoteContent?.revision ?? remote.revision
      }
    }
    itemComplete = true
    return { itemComplete, deletionConflictRecovered }
  }
  const localHash = hash(actualLocal)
  if (!baseline) {
    if (localHash === hash(remoteText ?? '')) {
      baselines[relative] = {
        fileId: remote.id,
        hash: localHash,
        revision: remoteContent?.revision ?? remote.revision
      }
    } else {
      const created = await preserveConflictCopy(relative, actualLocal)
      baselines[created.path] = {
        fileId: created.id,
        hash: created.localHash ?? localHash,
        revision: created.revision
      }
      await writeAtomic(root, relative, remoteText ?? '', localHash)
      baselines[relative] = {
        fileId: remote.id,
        hash: hash(remoteText ?? ''),
        revision: remoteContent?.revision ?? remote.revision
      }
    }
    itemComplete = true
    return { itemComplete, deletionConflictRecovered }
  }
  const localChanged = localHash !== baseline.hash
  const remoteChanged =
    remote.id !== baseline.fileId ||
    (remoteContent !== null && remoteContent.revision !== baseline.revision)
  if (localChanged && remoteChanged && remoteText !== undefined && localHash === hash(remoteText)) {
    const acceptedRevision = remoteContent?.revision ?? remote.revision
    baselines[relative] = {
      fileId: remote.id,
      hash: localHash,
      revision: acceptedRevision
    }
    const pendingUpdate = state.pendingUpdates[workspaceId]?.[remote.id]
    if (pendingUpdate?.targetHash === localHash) delete state.pendingUpdates[workspaceId][remote.id]
    ctx.nextSyncRevision = Math.max(ctx.nextSyncRevision ?? 0, acceptedRevision)
  } else if (localChanged && remoteChanged) {
    const created = await preserveConflictCopy(relative, actualLocal)
    baselines[created.path] = {
      fileId: created.id,
      hash: created.localHash ?? localHash,
      revision: created.revision
    }
    const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text
    await writeAtomic(root, relative, text, localHash)
    baselines[relative] = {
      fileId: remote.id,
      hash: hash(text),
      revision: remoteContent?.revision ?? remote.revision
    }
  } else if (localChanged) {
    const nextRevision = await replaceRemoteText(
      workspaceId,
      remote,
      remoteText ?? (await readRemoteText(workspaceId, remote)).text,
      actualLocal
    )
    baselines[relative] = { fileId: remote.id, hash: localHash, revision: nextRevision }
  } else if (remoteChanged) {
    const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text
    await writeAtomic(root, relative, text, localHash)
    baselines[relative] = {
      fileId: remote.id,
      hash: hash(text),
      revision: remoteContent?.revision ?? remote.revision
    }
  }
  itemComplete = true

  return { itemComplete, deletionConflictRecovered }
}
