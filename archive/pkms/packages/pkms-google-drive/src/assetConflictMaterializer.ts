import type { GoogleDriveOperationLog, DriveLogicalOperation } from './operationLog'
import type { GoogleDriveWorkspaceRepository } from './workspaceRepository'
import { sha256Hex } from './sha256'

type AssetReplacementOperation = DriveLogicalOperation & {
  mutation: Extract<DriveLogicalOperation['mutation'], { type: 'replace-content' }>
}

interface AssetConflictRepository {
  getEntry(fileId: string): ReturnType<GoogleDriveWorkspaceRepository['getEntry']>
  readFile(fileId: string): ReturnType<GoogleDriveWorkspaceRepository['readFile']>
  writeFile(
    fileId: string,
    bytes: Uint8Array,
    mimeType: string
  ): ReturnType<GoogleDriveWorkspaceRepository['writeFile']>
  createFileOnce(
    operationId: string,
    path: string,
    mimeType: string,
    bytes: Uint8Array,
    itemId?: string
  ): ReturnType<GoogleDriveWorkspaceRepository['createFileOnce']>
}

interface AssetConflictOperationLog {
  listAssetReplacementOperations(
    fileId: string
  ): ReturnType<GoogleDriveOperationLog['listAssetReplacementOperations']>
}

function compareOperations(left: DriveLogicalOperation, right: DriveLogicalOperation): number {
  return (
    left.sequence - right.sequence ||
    left.deviceId.localeCompare(right.deviceId) ||
    left.operationId.localeCompare(right.operationId)
  )
}

function conflictName(path: string, operation: DriveLogicalOperation): string {
  const slash = path.lastIndexOf('/')
  const directory = slash < 0 ? '' : path.slice(0, slash + 1)
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const hasExtension = dot > 0
  const stem = hasExtension ? name.slice(0, dot) : name
  const extension = hasExtension ? name.slice(dot) : ''
  const device = operation.deviceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'device'
  const operationId = operation.operationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12)
  return `${directory}${stem} (conflict-${device}-${operation.sequence}-${operationId})${extension}`
}

/**
 * Projects immutable asset versions without discarding losing bytes. When operation causality
 * cannot be proven, divergent payloads are retained as visible conflict copies and the winner
 * is chosen deterministically from the full per-file operation history.
 */
export class GoogleDriveAssetConflictMaterializer {
  constructor(
    private readonly repository: AssetConflictRepository,
    private readonly operationLog: AssetConflictOperationLog
  ) {}

  async apply(
    fileId: string,
    mimeType: string,
    bytes: Uint8Array,
    operation: DriveLogicalOperation
  ): Promise<void> {
    if (
      operation.mutation.type !== 'replace-content' ||
      operation.mutation.fileId !== fileId ||
      operation.mutation.mimeType !== mimeType
    )
      throw new Error('The asset replacement does not match its Drive operation.')

    if ((await sha256Hex(bytes)) !== (await sha256Hex(operation.mutation.bytes)))
      throw new Error('The asset bytes do not match the durable replacement operation.')

    const entry = await this.repository.getEntry(fileId)
    if (entry.kind !== 'asset')
      throw new Error('Binary replacement operations can only target Drive assets.')

    const history = await this.operationLog.listAssetReplacementOperations(fileId)
    const byId = new Map(history.map((item) => [item.operationId, item]))
    byId.set(operation.operationId, operation)
    const versions = [...byId.values()].sort(compareOperations)
    const distinct = new Map<string, AssetReplacementOperation>()
    for (const version of versions) {
      if (version.mutation.type !== 'replace-content' || version.mutation.fileId !== fileId)
        continue
      const hash = await sha256Hex(version.mutation.bytes)
      distinct.set(`${version.mutation.mimeType}:${hash}`, version as AssetReplacementOperation)
    }
    const divergentVersions = [...distinct.values()].sort(compareOperations)
    const winner = divergentVersions.at(-1)
    if (!winner) throw new Error('No durable asset version was found for this replacement.')

    if (divergentVersions.length > 1) {
      for (const version of divergentVersions.slice(0, -1)) {
        await this.repository.createFileOnce(
          `${version.operationId}-asset-conflict`,
          conflictName(entry.path, version),
          version.mutation.mimeType,
          version.mutation.bytes,
          `${version.operationId}-asset-conflict`
        )
      }
    }

    const current = await this.repository.readFile(fileId)
    if (
      current.metadata.mimeType !== winner.mutation.mimeType ||
      (await sha256Hex(current.bytes)) !== (await sha256Hex(winner.mutation.bytes))
    )
      await this.repository.writeFile(fileId, winner.mutation.bytes, winner.mutation.mimeType)
  }
}
