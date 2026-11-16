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
  const callOrder: string[] = []
  const port: GoogleDriveOperationLogPort = {
    append: vi.fn(async (operation) => {
      callOrder.push('append')
      const previous = operations.get(operation.operationId)
      if (previous && JSON.stringify(previous) !== JSON.stringify(operation))
        throw new Error('operation id collision')
      operations.set(operation.operationId, operation)
    }),
    initializeCursor: vi.fn(async () => {
      callOrder.push('initializeCursor')
      return 'cursor-initial'
    }),
    listChanges: vi.fn(async (_cursor, applied) => ({
      operations: [...operations.values()]
        .filter(
          (operation) => operation.workspaceRootId === rootId && !applied.has(operation.operationId)
        )
        .sort(
          (left, right) =>
            left.sequence - right.sequence || left.deviceId.localeCompare(right.deviceId)
        ),
      cursor: 'cursor-next'
    }))
  }
  return { port, operations, callOrder }
}

describe('GoogleDriveSyncEngine', () => {
  it('uploads local outbox operations, reconciles remote and local work, then acknowledges', async () => {
    const rootId = 'engine-root-one'
    const outbox = new MemoryDriveOutbox()
    await outbox.saveRemoteCursor(rootId, 'cursor-before-remote')
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
    expect(log.port.initializeCursor).not.toHaveBeenCalled()
    await expect(outbox.getRemoteCursor(rootId)).resolves.toBe('cursor-next')
    expect(log.operations.has(pending.operationId)).toBe(true)
    expect(reconcile.mock.calls[0][0].map((operation) => operation.operationId)).toEqual([
      pending.operationId,
      'remote-op'
    ])
    await expect(outbox.allocateSequence(rootId)).resolves.toBe(5)
  })

  it('establishes a new device baseline before uploading its first local operation', async () => {
    const rootId = 'engine-root-new-device'
    const outbox = new MemoryDriveOutbox()
    const log = operationLog(rootId)
    const reconcile = vi.fn(async (_operations: readonly DriveLogicalOperation[]) => {})
    const engine = new GoogleDriveSyncEngine(rootId, outbox, log.port, reconcile)
    const pending = await engine.enqueue({ type: 'create-folder', path: 'new-folder' })

    await engine.sync()

    expect(log.port.initializeCursor).toHaveBeenCalledTimes(1)
    expect(log.callOrder.indexOf('initializeCursor')).toBeLessThan(log.callOrder.indexOf('append'))
    expect(log.port.listChanges).toHaveBeenCalledWith('cursor-initial', new Set())
    expect(reconcile).toHaveBeenCalledWith([
      expect.objectContaining({ operationId: pending.operationId })
    ])
    await expect(outbox.getRemoteCursor(rootId)).resolves.toBe('cursor-next')
  })

  it('does not replay old operation payloads when a new device establishes its initial cursor', async () => {
    const rootId = 'engine-root-history-baseline'
    const outbox = new MemoryDriveOutbox()
    const oldOperation = remoteOperation(rootId, 'old-history')
    const initializeCursor = vi.fn(async () => 'current-head')
    const listChanges = vi.fn(async (cursor: string) => ({
      operations: cursor === 'current-head' ? [] : [oldOperation],
      cursor: 'after-head'
    }))
    const log: GoogleDriveOperationLogPort = {
      append: vi.fn(async () => {}),
      initializeCursor,
      listChanges
    }
    const reconcile = vi.fn(async (_operations: readonly DriveLogicalOperation[]) => {})
    const engine = new GoogleDriveSyncEngine(rootId, outbox, log, reconcile)

    await engine.sync()

    expect(initializeCursor).toHaveBeenCalledTimes(1)
    expect(listChanges).toHaveBeenCalledWith('current-head', new Set())
    expect(reconcile).not.toHaveBeenCalled()
    await expect(outbox.getRemoteCursor(rootId)).resolves.toBe('after-head')
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
    await expect(outbox.getRemoteCursor(rootId)).resolves.toBe('cursor-initial')
    await expect(engine.sync()).resolves.toMatchObject({
      pendingOperations: 0,
      uploadedOperations: 1
    })
    expect(log.port.append).toHaveBeenCalledTimes(2)
    expect(log.operations.size).toBe(1)
    expect(log.operations.has('stable-operation')).toBe(true)
    await expect(outbox.getRemoteCursor(rootId)).resolves.toBe('cursor-next')
  })

  it('coalesces overlapping sync requests for the same workspace root', async () => {
    const rootId = 'engine-root-three'
    const outbox = new MemoryDriveOutbox()
    await outbox.saveRemoteCursor(rootId, 'cursor-before-remote')
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
