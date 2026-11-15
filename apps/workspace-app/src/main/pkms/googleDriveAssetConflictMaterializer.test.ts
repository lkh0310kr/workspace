import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveAssetConflictMaterializer,
  type DriveLogicalOperation,
  type GoogleDriveWorkspaceRepository,
  type GoogleDriveOperationLog
} from '../../../../../packages/pkms-google-drive/src'

function replacement(
  operationId: string,
  deviceId: string,
  sequence: number,
  bytes: number[]
): DriveLogicalOperation {
  return {
    version: 1,
    workspaceRootId: 'root',
    operationId,
    deviceId,
    sequence,
    createdAt: sequence,
    mutation: {
      type: 'replace-content',
      fileId: 'asset-id',
      mimeType: 'image/png',
      bytes: new Uint8Array(bytes)
    }
  }
}

describe('GoogleDriveAssetConflictMaterializer', () => {
  it('preserves divergent versions as deterministic conflict files and projects the same winner', async () => {
    const first = replacement('op-first', 'device-a', 1, [1, 2, 3])
    const winner = replacement('op-winner', 'device-b', 2, [4, 5, 6])
    let current = new Uint8Array([0])
    const created = new Set<string>()
    const createFileOnce = vi.fn(async (operationId: string, ...args: unknown[]) => {
      if (!created.has(operationId)) created.add(operationId)
      return args as never
    })
    const repository = {
      getEntry: vi.fn(async () => ({
        id: 'asset-id',
        name: 'photo.png',
        path: 'images/photo.png',
        kind: 'asset'
      })),
      readFile: vi.fn(async () => ({ metadata: { id: 'asset-id' }, bytes: current })),
      writeFile: vi.fn(async (_id: string, bytes: Uint8Array) => {
        current = new Uint8Array(bytes)
        return {} as never
      }),
      createFileOnce
    } as unknown as GoogleDriveWorkspaceRepository
    const operationLog = {
      listAssetReplacementOperations: vi.fn(async () => [first, winner])
    } as unknown as GoogleDriveOperationLog
    const materializer = new GoogleDriveAssetConflictMaterializer(repository, operationLog)

    await materializer.apply(
      'asset-id',
      'image/png',
      first.mutation.type === 'replace-content' ? first.mutation.bytes : new Uint8Array(),
      first
    )

    expect(createFileOnce).toHaveBeenCalledTimes(1)
    expect(createFileOnce).toHaveBeenCalledWith(
      'op-first-asset-conflict',
      'images/photo (conflict-device-a-1-op-first).png',
      'image/png',
      new Uint8Array([1, 2, 3]),
      'op-first-asset-conflict'
    )
    expect(current).toEqual(new Uint8Array([4, 5, 6]))

    await materializer.apply(
      'asset-id',
      'image/png',
      winner.mutation.type === 'replace-content' ? winner.mutation.bytes : new Uint8Array(),
      winner
    )
    expect(createFileOnce).toHaveBeenCalledTimes(2)
    expect(current).toEqual(new Uint8Array([4, 5, 6]))
  })

  it('does not create a conflict copy when operations contain the same bytes', async () => {
    const first = replacement('op-first', 'device-a', 1, [9, 8, 7])
    const second = replacement('op-second', 'device-b', 2, [9, 8, 7])
    const writeFile = vi.fn(async () => ({}) as never)
    const repository = {
      getEntry: vi.fn(async () => ({
        id: 'asset-id',
        path: 'photo.png',
        name: 'photo.png',
        kind: 'asset'
      })),
      readFile: vi.fn(async () => ({
        metadata: { id: 'asset-id', mimeType: 'image/png' },
        bytes: new Uint8Array([9, 8, 7])
      })),
      writeFile,
      createFileOnce: vi.fn()
    } as unknown as GoogleDriveWorkspaceRepository
    const operationLog = {
      listAssetReplacementOperations: vi.fn(async () => [first, second])
    } as unknown as GoogleDriveOperationLog
    const materializer = new GoogleDriveAssetConflictMaterializer(repository, operationLog)

    await materializer.apply(
      'asset-id',
      'image/png',
      second.mutation.type === 'replace-content' ? second.mutation.bytes : new Uint8Array(),
      second
    )

    expect(repository.createFileOnce).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })
})
