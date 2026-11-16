import type { DriveLogicalOperation, GoogleDriveOperationLog } from './operationLog'
import { enqueueDriveMutation, type DriveOutbox, type DriveOutboxMutation } from './outbox'

export interface DriveSyncResult {
  uploadedOperations: number
  appliedOperations: number
  pendingOperations: number
}

export interface GoogleDriveOperationLogPort {
  append(operation: DriveLogicalOperation): Promise<unknown>
  initializeCursor(): Promise<string>
  listChanges(
    cursor: string,
    appliedOperationIds: ReadonlySet<string>
  ): Promise<{ operations: DriveLogicalOperation[]; cursor: string }>
}

const activeSyncs = new Map<string, Promise<DriveSyncResult>>()

/**
 * Coordinates durable local changes with the immutable Drive log.
 * Reconcile must be idempotent and durable before it resolves.
 */
export class GoogleDriveSyncEngine {
  constructor(
    readonly workspaceRootId: string,
    private readonly outbox: DriveOutbox,
    private readonly operationLog: GoogleDriveOperationLogPort | GoogleDriveOperationLog,
    private readonly reconcile: (operations: readonly DriveLogicalOperation[]) => Promise<void>
  ) {}

  enqueue(mutation: DriveOutboxMutation): Promise<import('./outbox').DriveOutboxOperation> {
    return enqueueDriveMutation(this.outbox, this.workspaceRootId, mutation)
  }

  sync(): Promise<DriveSyncResult> {
    const active = activeSyncs.get(this.workspaceRootId)
    if (active) return active
    const synchronization = this.synchronize().finally(() => {
      if (activeSyncs.get(this.workspaceRootId) === synchronization)
        activeSyncs.delete(this.workspaceRootId)
    })
    activeSyncs.set(this.workspaceRootId, synchronization)
    return synchronization
  }

  private async synchronize(): Promise<DriveSyncResult> {
    let cursor = await this.outbox.getRemoteCursor(this.workspaceRootId)
    if (!cursor) {
      cursor = await this.operationLog.initializeCursor()
      await this.outbox.saveRemoteCursor(this.workspaceRootId, cursor)
    }

    const pending = await this.outbox.list(this.workspaceRootId)
    for (const item of pending) {
      await this.operationLog.append({
        version: 1,
        workspaceRootId: item.workspaceRootId,
        operationId: item.operationId,
        deviceId: item.deviceId,
        sequence: item.sequence,
        createdAt: item.createdAt,
        mutation: item.mutation
      })
    }

    const changes = await this.operationLog.listChanges(cursor, new Set())
    const operations = changes.operations
    const pendingIds = new Set(pending.map((operation) => operation.operationId))
    if (operations.length) {
      await this.outbox.observeSequence(
        this.workspaceRootId,
        operations.reduce((maximum, operation) => Math.max(maximum, operation.sequence), 0)
      )
      await this.reconcile(operations)
      for (const operation of operations) {
        if (pendingIds.has(operation.operationId))
          await this.outbox.markAppliedOperation(this.workspaceRootId, operation.operationId)
      }
    }
    await this.outbox.saveRemoteCursor(this.workspaceRootId, changes.cursor)

    const acknowledged = await this.outbox.getAppliedOperationIds(this.workspaceRootId, [
      ...pendingIds
    ])
    for (const operationId of acknowledged)
      await this.outbox.acknowledge(this.workspaceRootId, operationId)

    return {
      uploadedOperations: pending.length,
      appliedOperations: operations.length,
      pendingOperations: await this.outbox.count(this.workspaceRootId)
    }
  }
}
