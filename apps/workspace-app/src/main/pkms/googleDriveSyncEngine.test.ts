import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveSyncEngine,
  MemoryDriveOutbox,
  type DriveLogicalOperation,
  type GoogleDriveOperationLogPort
} from '../../../../../packages/pkms-google-drive/src'

function remoteOperation(rootId: string, operationId: string): DriveLogicalOperation {
  return {
    version: 1,
    workspaceRootId: rootId,
    operationId,
    deviceId: 'remote-device',
    sequence: 4,
    createdAt: 4,
    mutation: { type: 'rename', fileId: 'note', name: 'remote.md' }
  }
}

function operationLog(rootId: string, initial: DriveLogicalOperation[] = []) {
  const operations = new Map(initial.map((operation) => [operation.operationId, operation]))
  const port: GoogleDriveOperationLogPort = {
    append: vi.fn(async (operation) => {
      const previous = operations.get(operation.operationId)
      if (previous && JSON.stringify(previous) !== JSON.stringify(operation))
        throw new Error('operation id collision')
      operations.set(operation.operationId, operation)
    }),
    listUnapplied: vi.fn(async (applied) =>
      [...operations.values()]
        .filter(
          (operation) => operation.workspaceRootId === rootId && !applied.has(operation.operationId)
        )
        .sort(
          (left, right) =>
            left.sequence - right.sequence || left.deviceId.localeCompare(right.deviceId)
        )
    )
  }
  return { port, operations }
}

describe('GoogleDriveSyncEngine', () => {
  it('uploads local outbox operations, reconciles remote and local work, then acknowledges', async () => {
    const rootId = 'engine-root-one'
    const outbox = new MemoryDriveOutbox()
    const log = operationLog(rootId, [remoteOperation(rootId, 'remote-op')])
    const reconcile = vi.fn(async (_operations: readonly DriveLogicalOperation[]) => {})
    const engine = new GoogleDriveSyncEngine(rootId, outbox, log.port, reconcile)
    const pending = await engine.enqueue({
      type: 'document-update',
      fileId: 'note',
      update: new Uint8Array([1, 2])
    })

    await expect(engine.sync()).resolves.toMatchObject({
      uploadedOperations: 1,
      appliedOperations: 2,
      pendingOperations: 0
    })
    expect(log.port.append).toHaveBeenCalledTimes(1)
    expect(log.operations.has(pending.operationId)).toBe(true)
    expect(reconcile.mock.calls[0][0].map((operation) => operation.operationId)).toEqual([
      pending.operationId,
      'remote-op'
    ])
    await expect(outbox.allocateSequence(rootId)).resolves.toBe(5)
  })

  it('retains the durable outbox until reconciliation succeeds and retries the same operation ID', async () => {
    const rootId = 'engine-root-two'
    const outbox = new MemoryDriveOutbox()
    const log = operationLog(rootId)
    await outbox.enqueue({
      workspaceRootId: rootId,
      operationId: 'stable-operation',
      deviceId: await outbox.getDeviceId(),
      sequence: await outbox.allocateSequence(rootId),
      createdAt: 1,
      mutation: { type: 'create-folder', path: 'new-folder' }
    })
    const reconcile = vi
      .fn()
      .mockRejectedValueOnce(new Error('Drive projection failed'))
      .mockResolvedValue(undefined)
    const engine = new GoogleDriveSyncEngine(rootId, outbox, log.port, reconcile)

    await expect(engine.sync()).rejects.toThrow('Drive projection failed')
    await expect(outbox.count(rootId)).resolves.toBe(1)
    await expect(engine.sync()).resolves.toMatchObject({
      pendingOperations: 0,
      uploadedOperations: 1
    })
    expect(log.port.append).toHaveBeenCalledTimes(2)
    expect(log.operations.size).toBe(1)
    expect(log.operations.has('stable-operation')).toBe(true)
  })

  it('coalesces overlapping sync requests for the same workspace root', async () => {
    const rootId = 'engine-root-three'
    const outbox = new MemoryDriveOutbox()
    const log = operationLog(rootId, [remoteOperation(rootId, 'remote-op')])
    let release!: () => void
    const reconcile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const engine = new GoogleDriveSyncEngine(rootId, outbox, log.port, reconcile)

    const first = engine.sync()
    const second = engine.sync()
    expect(second).toBe(first)
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1))
    release()
    await expect(first).resolves.toMatchObject({ appliedOperations: 1, pendingOperations: 0 })
  })
})
