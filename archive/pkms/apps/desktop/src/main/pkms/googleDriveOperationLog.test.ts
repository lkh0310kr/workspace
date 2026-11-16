import { describe, expect, it, vi } from 'vitest'
import {
  decodeDriveLogicalOperation,
  encodeDriveLogicalOperation,
  GoogleDriveOperationLog,
  type DriveFile,
  type DriveLogicalOperation,
  type GoogleDriveClient
} from '../../../../../packages/pkms-google-drive/src'

const documentUpdate = (sequence: number, operationId: string): DriveLogicalOperation => ({
  version: 1,
  workspaceRootId: 'root',
  operationId,
  deviceId: 'device-a',
  sequence,
  createdAt: sequence,
  mutation: {
    type: 'document-update',
    fileId: 'note',
    update: new Uint8Array([sequence, 0, 255])
  }
})

describe('GoogleDriveOperationLog', () => {
  it('round trips binary Yjs update bytes without lossy string conversion', () => {
    const operation = documentUpdate(1, 'operation-1')
    expect(decodeDriveLogicalOperation(encodeDriveLogicalOperation(operation))).toEqual(operation)
  })

  it('round trips create-file bytes and metadata', () => {
    const operation: DriveLogicalOperation = {
      version: 1,
      workspaceRootId: 'root',
      operationId: 'create-1',
      deviceId: 'device-a',
      sequence: 1,
      createdAt: 1,
      mutation: {
        type: 'create-file',
        path: '.hidden/note.md',
        mimeType: 'text/markdown',
        bytes: new Uint8Array([0, 128, 255])
      }
    }
    expect(decodeDriveLogicalOperation(encodeDriveLogicalOperation(operation))).toEqual(operation)
  })

  it('rejects malformed and unsupported protocol records', () => {
    expect(() => decodeDriveLogicalOperation(new TextEncoder().encode('{}'))).toThrow(
      /malformed or unsupported/
    )
    expect(() =>
      decodeDriveLogicalOperation(
        new TextEncoder().encode(
          JSON.stringify({
            version: 2,
            workspaceRootId: 'root',
            operationId: 'x',
            deviceId: 'd',
            sequence: 1,
            createdAt: 1,
            mutation: { type: 'document-update', fileId: 'note', update: 'AA==' }
          })
        )
      )
    ).toThrow(/malformed or unsupported/)
  })

  it('appends stable operations with metadata indexes for incremental sync and per-file history', async () => {
    const folders: DriveFile[] = [
      { id: 'protocol', name: '.pkms-sync', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'operations', name: 'operations', mimeType: 'application/vnd.google-apps.folder' }
    ]
    const payloads = new Map<string, Uint8Array>()
    const digests = new Map<string, string>()
    const client = {
      ensureFolder: vi.fn(async (name: string) => folders.find((folder) => folder.name === name)!),
      createImmutableOperation: vi.fn(async (_parentId, operationId, bytes, digest) => {
        const id = `file-${operationId}`
        payloads.set(id, bytes)
        digests.set(id, digest)
        return {
          id,
          name: `op-${operationId}.json`,
          mimeType: 'application/json',
          parents: ['operations'],
          appProperties: { pkmsOperationId: operationId, pkmsPayloadSha256: digest }
        }
      }),
      findOperation: vi.fn(async (_parentId: string, operationId: string) =>
        [...payloads.keys()]
          .filter(
            (id) => decodeDriveLogicalOperation(payloads.get(id)!).operationId === operationId
          )
          .map((id) => {
            const operation = decodeDriveLogicalOperation(payloads.get(id)!)
            return {
              id,
              name: `op-${operation.operationId}.json`,
              mimeType: 'application/json',
              parents: ['operations'],
              appProperties: {
                pkmsOperationId: operation.operationId,
                pkmsPayloadSha256: digests.get(id)
              }
            }
          })
      ),
      download: vi.fn(async (id: string) => payloads.get(id)!)
    } as unknown as GoogleDriveClient
    const log = new GoogleDriveOperationLog(client, 'root')

    await log.append(documentUpdate(2, 'second'))
    await log.append(documentUpdate(1, 'first'))
    expect(client.ensureFolder).toHaveBeenCalledTimes(2)
    expect(client.createImmutableOperation).toHaveBeenCalledTimes(2)
    expect(client.createImmutableOperation).toHaveBeenNthCalledWith(
      1,
      'operations',
      'second',
      expect.any(Uint8Array),
      expect.any(String),
      expect.objectContaining({
        pkmsWorkspaceRootId: 'root',
        pkmsOperationType: 'document-update',
        pkmsFileId: 'note'
      })
    )
  })

  it('loads a single operation by ID without listing or downloading the whole log', async () => {
    const payload = encodeDriveLogicalOperation(documentUpdate(1, 'target'))
    const client = {
      ensureFolder: vi.fn(async (name: string) => ({
        id: name === '.pkms-sync' ? 'protocol' : 'operations',
        name,
        mimeType: 'application/vnd.google-apps.folder'
      })),
      findOperation: vi.fn(async () => [
        {
          id: 'target-file',
          name: 'op-target.json',
          mimeType: 'application/json',
          appProperties: {
            pkmsOperationId: 'target',
            pkmsPayloadSha256: await digest(payload)
          }
        }
      ]),
      download: vi.fn(async () => payload)
    } as unknown as GoogleDriveClient
    const log = new GoogleDriveOperationLog(client, 'root')

    await expect(log.get('target')).resolves.toEqual(documentUpdate(1, 'target'))
    expect(client.findOperation).toHaveBeenCalledWith('operations', 'target')
    expect(client.download).toHaveBeenCalledTimes(1)
  })

  it('uses the Drive change cursor for sync and fetches document history by file ID', async () => {
    const seed: DriveLogicalOperation = {
      version: 1,
      workspaceRootId: 'root',
      operationId: 'seed-note',
      deviceId: 'seed-device',
      sequence: 0,
      createdAt: 0,
      mutation: { type: 'document-seed', fileId: 'note', text: '# Note' }
    }
    const update = documentUpdate(1, 'update-note')
    const otherUpdate = {
      ...documentUpdate(2, 'update-other'),
      mutation: { ...documentUpdate(2, 'update-other').mutation, fileId: 'other' }
    }
    const records = [seed, update, otherUpdate].map((operation) => {
      const bytes = encodeDriveLogicalOperation(operation)
      const properties = {
        pkmsOperationId: operation.operationId,
        pkmsPayloadSha256: '',
        pkmsWorkspaceRootId: 'root',
        pkmsOperationType: operation.mutation.type,
        ...(operation.mutation.type === 'document-seed' ||
        operation.mutation.type === 'document-update'
          ? { pkmsFileId: operation.mutation.fileId }
          : {})
      }
      return { operation, bytes, properties }
    })
    for (const record of records) record.properties.pkmsPayloadSha256 = await digest(record.bytes)
    const bytesById = new Map(records.map((record) => [record.operation.operationId, record.bytes]))
    const fileFor = (record: (typeof records)[number]): DriveFile => ({
      id: `file-${record.operation.operationId}`,
      name: `op-${record.operation.operationId}.json`,
      mimeType: 'application/json',
      parents: ['operations'],
      appProperties: record.properties
    })
    const files = records.map(fileFor)
    const unrelated: DriveFile = {
      id: 'markdown-file',
      name: 'note.md',
      mimeType: 'text/markdown',
      parents: ['root']
    }
    const client = {
      ensureFolder: vi.fn(async (name: string) => ({
        id: name === '.pkms-sync' ? 'protocol' : 'operations',
        name,
        mimeType: 'application/vnd.google-apps.folder'
      })),
      listFiles: vi.fn(async ({ query }: { query?: string }) =>
        query?.includes("value='note'")
          ? files.filter((file) => file.appProperties?.pkmsFileId === 'note')
          : []
      ),
      listChangesPage: vi.fn(async () => ({
        changes: [
          { fileId: files[1].id, file: files[1] },
          { fileId: unrelated.id, file: unrelated },
          { fileId: files[2].id, file: files[2] }
        ],
        newStartPageToken: 'cursor-next'
      })),
      startChanges: vi.fn(async () => 'cursor-start'),
      listChildren: vi.fn(async () => files),
      download: vi.fn(async (id: string) => {
        const operationId = id.replace('file-', '')
        return bytesById.get(operationId)!
      })
    } as unknown as GoogleDriveClient
    const log = new GoogleDriveOperationLog(client, 'root')

    const cursor = await log.initializeCursor()
    const changes = await log.listChanges(cursor, new Set(['update-other']))
    const history = await log.listDocumentOperations('note')

    expect(cursor).toBe('cursor-start')
    expect(changes).toEqual({ operations: [update], cursor: 'cursor-next' })
    expect(history).toEqual([seed, update])
    expect(client.download).toHaveBeenCalledTimes(3)
    expect(client.listFiles).toHaveBeenCalledTimes(1)
  })

  it('rejects operations targeted at a different workspace', async () => {
    const client = {} as GoogleDriveClient
    const log = new GoogleDriveOperationLog(client, 'root')
    await expect(
      log.append({ ...documentUpdate(1, 'other-root'), workspaceRootId: 'other' })
    ).rejects.toThrow(/different Google Drive workspace/)
  })
})

async function digest(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const hash = await crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
