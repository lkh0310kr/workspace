import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fetchPkmsAsset } from './api'
import type { PkmsSyncBridgeStatus, PkmsSyncItemState } from '../../shared/pkmsSyncBridge'
import { request, uploadAsset } from './syncBridgeRemote'
import type { BridgeFile } from './syncBridgeRemote'

export type Baseline = { fileId: string; hash: string; revision: number }
export type AssetFingerprint = { fingerprint: string; hash: string; gitBlobSha?: string }
export type LocalAsset = { hash: string; fingerprint: string; gitBlobSha?: string }

export type AssetSyncContext = {
  workspaceId: string
  root: string
  localAssets: Map<string, LocalAsset>
  remoteAssetsByPath: Map<string, BridgeFile>
  baselines: Record<string, Baseline>
  assetFingerprints: Record<string, Record<string, AssetFingerprint>>
  knownRemoteFiles: Record<string, BridgeFile>
  knownRemoteTree: BridgeFile[] | undefined
  nextSyncRevision: number | undefined
  safePath: (root: string, relative: string) => string
  assertSafeParentDirectories: (root: string, relative: string) => Promise<void>
  localAssetFingerprint: (stat: {
    dev: bigint
    ino: bigint
    size: bigint
    mtimeNs: bigint
    ctimeNs: bigint
  }) => string
  hash: (content: string | Uint8Array) => string
  gitBlobHashBytes: (bytes: Uint8Array) => string
  writeAtomicBytes: (
    root: string,
    relative: string,
    bytes: Uint8Array,
    expectedCurrentHash?: string | null
  ) => Promise<void>
  status: (workspaceId: string) => PkmsSyncBridgeStatus
  setItemState: (workspaceId: string, relative: string, itemState: PkmsSyncItemState | null) => void
  notifyLocalTreeChanged: (workspaceId: string, relativePath: string | null) => void
}

export async function reconcileSyncAsset(ctx: AssetSyncContext, relative: string): Promise<void> {
  ctx.setItemState(ctx.workspaceId, relative, 'syncing')
  try {
    let localAsset = ctx.localAssets.get(relative)
    const remote = ctx.remoteAssetsByPath.get(relative)
    let baseline = ctx.baselines[relative]
    const localPath = ctx.safePath(ctx.root, relative)
    let localBytes: Uint8Array | null = null
    const readLocal = async (): Promise<Uint8Array> => {
      await ctx.assertSafeParentDirectories(ctx.root, relative)
      const stat = await fs.lstat(localPath)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe_sync_path')
      localBytes ??= new Uint8Array(await fs.readFile(localPath))
      return localBytes
    }
    const writeFingerprint = async (bytesHash: string, gitBlobSha: string): Promise<void> => {
      const stat = await fs.lstat(localPath, { bigint: true })
      const fingerprint = ctx.localAssetFingerprint(stat)
      ;(ctx.assetFingerprints[ctx.workspaceId] ??= {})[relative] = {
        fingerprint,
        hash: bytesHash,
        gitBlobSha
      }
    }
    const readRemote = async (file: BridgeFile): Promise<Uint8Array> =>
      fetchPkmsAsset(
        `/api/workspaces/${encodeURIComponent(ctx.workspaceId)}/assets/${encodeURIComponent(file.id)}`
      ).then((result) => result.bytes)
    const remember = (file: BridgeFile, bytesHash: string): void => {
      ctx.knownRemoteFiles[file.id] = file
      ctx.remoteAssetsByPath.set(file.path, file)
      ctx.knownRemoteTree = [
        ...(ctx.knownRemoteTree ?? []).filter(
          (entry) => entry.id !== file.id && entry.path !== file.path
        ),
        file
      ]
      ctx.baselines[file.path] = { fileId: file.id, hash: bytesHash, revision: file.revision }
      ctx.nextSyncRevision = Math.max(ctx.nextSyncRevision ?? 0, file.revision)
    }
    const uploadNew = async (uploadPath: string, bytes: Uint8Array): Promise<BridgeFile> => {
      const result = await uploadAsset(ctx.workspaceId, uploadPath, null, null, bytes)
      const file: BridgeFile = {
        id: result.fileId,
        path: result.conflictCopyPath ?? result.path,
        kind: 'asset',
        revision: result.acceptedRevision,
        size: bytes.byteLength,
        localHash: ctx.hash(bytes)
      }
      remember(file, ctx.hash(bytes))
      return file
    }
    const removeLocalBytes = async (expectedHash: string): Promise<void> => {
      const current = await readLocal()
      if (ctx.hash(current) !== expectedHash) throw new Error('local_file_changed_retry')
      await fs.rm(localPath)
      delete (ctx.assetFingerprints[ctx.workspaceId] ?? {})[relative]
    }
    if (localAsset) {
      try {
        const stat = await fs.lstat(localPath, { bigint: true })
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe_sync_path')
        const fingerprint = ctx.localAssetFingerprint(stat)
        if (fingerprint !== localAsset.fingerprint || !localAsset.gitBlobSha) {
          const bytes = await readLocal()
          localAsset = {
            fingerprint,
            hash: ctx.hash(bytes),
            gitBlobSha: ctx.gitBlobHashBytes(bytes)
          }
          ;(ctx.assetFingerprints[ctx.workspaceId] ??= {})[relative] = localAsset
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') localAsset = undefined
        else throw error
      }
    }
    if (!localAsset) {
      try {
        await ctx.assertSafeParentDirectories(ctx.root, relative)
        const stat = await fs.lstat(localPath, { bigint: true })
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe_sync_path')
        const bytes = await readLocal()
        const fingerprint = ctx.localAssetFingerprint(stat)
        localAsset = {
          hash: ctx.hash(bytes),
          fingerprint,
          gitBlobSha: ctx.gitBlobHashBytes(bytes)
        }
        ;(ctx.assetFingerprints[ctx.workspaceId] ??= {})[relative] = localAsset
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    if (!remote && !localAsset) {
      delete ctx.baselines[relative]
      return
    }
    if (!remote && localAsset) {
      const bytes = await readLocal()
      if (baseline) {
        if (ctx.hash(bytes) !== baseline.hash) {
          const ext = path.posix.extname(relative)
          const conflictPath = `${relative.slice(0, -ext.length)}.local-conflict-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
          await ctx.writeAtomicBytes(ctx.root, conflictPath, bytes, null)
          const created = await uploadNew(conflictPath, bytes)
          ctx.baselines[created.path] = {
            fileId: created.id,
            hash: ctx.hash(bytes),
            revision: created.revision
          }
        }
        await removeLocalBytes(ctx.hash(bytes))
        delete ctx.baselines[relative]
      } else {
        await uploadNew(relative, bytes)
      }
      return
    }
    if (remote && !localAsset) {
      if (!baseline) {
        const bytes = await readRemote(remote)
        await ctx.writeAtomicBytes(ctx.root, relative, bytes, null)
        const bytesHash = ctx.hash(bytes)
        remember(remote, bytesHash)
        await writeFingerprint(bytesHash, ctx.gitBlobHashBytes(bytes))
        ctx.notifyLocalTreeChanged(ctx.workspaceId, relative)
        return
      }
      const remoteChanged = remote.id !== baseline.fileId || remote.revision !== baseline.revision
      if (remoteChanged) {
        const bytes = await readRemote(remote)
        await ctx.writeAtomicBytes(ctx.root, relative, bytes, null)
        const bytesHash = ctx.hash(bytes)
        remember(remote, bytesHash)
        await writeFingerprint(bytesHash, ctx.gitBlobHashBytes(bytes))
        ctx.notifyLocalTreeChanged(ctx.workspaceId, relative)
        return
      }
      const result = await request<{ acceptedRevision?: number }>(
        `/api/workspaces/${encodeURIComponent(ctx.workspaceId)}/operations`,
        'POST',
        {
          operationId: randomUUID(),
          baseRevision: ctx.nextSyncRevision ?? 0,
          clientId: 'desktop-sync-bridge',
          operation: { type: 'delete', fileId: remote.id, expectedRevision: remote.revision }
        }
      )
      delete ctx.knownRemoteFiles[remote.id]
      ctx.remoteAssetsByPath.delete(relative)
      ctx.knownRemoteTree = (ctx.knownRemoteTree ?? []).filter((entry) => entry.id !== remote.id)
      delete ctx.baselines[relative]
      ctx.nextSyncRevision = Math.max(ctx.nextSyncRevision ?? 0, result.acceptedRevision ?? 0)
      return
    }
    if (!remote || !localAsset) return
    const localHash = localAsset.hash
    baseline = ctx.baselines[relative]
    if (!baseline && remote.sha && localAsset.gitBlobSha === remote.sha) {
      remember(remote, localHash)
      return
    }
    const remoteChanged =
      !baseline || remote.id !== baseline.fileId || remote.revision !== baseline.revision
    const localChanged = !baseline || localHash !== baseline.hash
    if (remote.sha && localAsset.gitBlobSha === remote.sha) {
      remember(remote, localHash)
      return
    }
    if (!baseline) {
      const localBytes = await readLocal()
      if (ctx.hash(localBytes) !== localHash) throw new Error('local_file_changed_retry')
      const remoteBytes = await readRemote(remote)
      const remoteHash = ctx.hash(remoteBytes)
      if (remoteHash === localHash) {
        remember(remote, localHash)
        return
      }
      const ext = path.posix.extname(relative)
      const base = ext ? relative.slice(0, -ext.length) : relative
      const conflictPath = `${base}.local-conflict-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
      await ctx.writeAtomicBytes(ctx.root, conflictPath, localBytes, null)
      const created = await uploadNew(conflictPath, localBytes)
      ctx.baselines[created.path] = {
        fileId: created.id,
        hash: localHash,
        revision: created.revision
      }
      await ctx.writeAtomicBytes(ctx.root, relative, remoteBytes, localHash)
      remember(remote, remoteHash)
      await writeFingerprint(remoteHash, ctx.gitBlobHashBytes(remoteBytes))
      ctx.setItemState(ctx.workspaceId, relative, 'attention')
      ctx.notifyLocalTreeChanged(ctx.workspaceId, relative)
      return
    }
    if (localChanged && remoteChanged && baseline) {
      const localBytes = await readLocal()
      if (ctx.hash(localBytes) !== localHash) throw new Error('local_file_changed_retry')
      const ext = path.posix.extname(relative)
      const base = ext ? relative.slice(0, -ext.length) : relative
      const conflictPath = `${base}.local-conflict-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
      await ctx.writeAtomicBytes(ctx.root, conflictPath, localBytes, null)
      const created = await uploadNew(conflictPath, localBytes)
      ctx.baselines[created.path] = {
        fileId: created.id,
        hash: localHash,
        revision: created.revision
      }
      const remoteBytes = await readRemote(remote)
      await ctx.writeAtomicBytes(ctx.root, relative, remoteBytes, localHash)
      const remoteHash = ctx.hash(remoteBytes)
      remember(remote, remoteHash)
      await writeFingerprint(remoteHash, ctx.gitBlobHashBytes(remoteBytes))
      ctx.setItemState(ctx.workspaceId, relative, 'attention')
      ctx.notifyLocalTreeChanged(ctx.workspaceId, relative)
    } else if (localChanged) {
      const localBytes = await readLocal()
      if (ctx.hash(localBytes) !== localHash) throw new Error('local_file_changed_retry')
      const result = await uploadAsset(
        ctx.workspaceId,
        relative,
        remote.id,
        remote.revision,
        localBytes
      )
      const updated: BridgeFile = {
        ...remote,
        revision: result.acceptedRevision,
        size: localBytes.byteLength,
        sha: ctx.gitBlobHashBytes(localBytes),
        localHash
      }
      remember(updated, localHash)
      await writeFingerprint(localHash, ctx.gitBlobHashBytes(localBytes))
    } else if (remoteChanged) {
      const remoteBytes = await readRemote(remote)
      const remoteHash = ctx.hash(remoteBytes)
      await ctx.writeAtomicBytes(ctx.root, relative, remoteBytes, localHash)
      remember(remote, remoteHash)
      await writeFingerprint(remoteHash, ctx.gitBlobHashBytes(remoteBytes))
      ctx.notifyLocalTreeChanged(ctx.workspaceId, relative)
    } else {
      remember(remote, localHash)
    }
  } finally {
    if (ctx.status(ctx.workspaceId).itemStates[relative] === 'syncing')
      ctx.setItemState(ctx.workspaceId, relative, 'synced')
  }
}
