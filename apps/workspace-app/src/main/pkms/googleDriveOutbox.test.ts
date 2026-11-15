import { describe, expect, it } from 'vitest'
import {
  enqueueDriveMutation,
  MemoryDriveOutbox,
  type DriveOutboxOperation
} from '../../../../../packages/pkms-google-drive/src'

function operation(
  operationId: string,
  sequence: number,
  workspaceRootId = 'root'
): DriveOutboxOperation {
  return {
    workspaceRootId,
    operationId,
    deviceId: 'device-a',
    sequence,
    createdAt: sequence,
    mutation: {
      type: 'create-file',
      path: `${operationId}.md`,
      mimeType: 'text/markdown',
      bytes: new TextEncoder().encode(operationId)
    }
  }
}

describe('Drive outbox contract', () => {
  it('assigns a stable item identity before a new Drive file has a Drive ID', async () => {
    const outbox = new MemoryDriveOutbox()
    const operation = await enqueueDriveMutation(outbox, 'root', {
      type: 'create-file',
      path: 'offline-note.md',
      mimeType: 'text/markdown',
      bytes: new TextEncoder().encode('offline')
    })

    expect(operation.mutation).toMatchObject({
      type: 'create-file',
      itemId: operation.operationId
    })
    await expect(outbox.list('root')).resolves.toEqual([operation])
  })

  it('keeps stable operation IDs, orders by local sequence, and isolates workspace roots', async () => {
    const outbox = new MemoryDriveOutbox()
    await outbox.enqueue(operation('second', 2))
    await outbox.enqueue(operation('other-root', 1, 'other-root'))
    await outbox.enqueue(operation('first', 1))
    await outbox.enqueue(operation('first', 1))

    await expect(outbox.list('root')).resolves.toMatchObject([
      { operationId: 'first', sequence: 1 },
      { operationId: 'second', sequence: 2 }
    ])
    await expect(outbox.count('other-root')).resolves.toBe(1)
  })

  it('rejects operation ID reuse with a different payload and deletes only after explicit acknowledgement', async () => {
    const outbox = new MemoryDriveOutbox()
    await outbox.enqueue(operation('stable', 1))
    await expect(
      outbox.enqueue({
        ...operation('stable', 1),
        mutation: {
          type: 'create-file',
          path: 'different.md',
          mimeType: 'text/markdown',
          bytes: new TextEncoder().encode('different')
        }
      })
    ).rejects.toThrow(/collision/)
    await expect(outbox.count('root')).resolves.toBe(1)

    await outbox.acknowledge('root', 'stable')
    await expect(outbox.count('root')).resolves.toBe(0)
  })
})
