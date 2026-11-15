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

  it('appends with stable operation identity and lists in deterministic order', async () => {
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
      listChildren: vi.fn(async () =>
        [...payloads.keys()].map((id) => {
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
    await expect(log.list()).resolves.toEqual([
      documentUpdate(1, 'first'),
      documentUpdate(2, 'second')
    ])
    expect(client.ensureFolder).toHaveBeenCalledTimes(2)
    expect(client.createImmutableOperation).toHaveBeenCalledTimes(2)
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
      listChildren: vi.fn(),
      download: vi.fn(async () => payload)
    } as unknown as GoogleDriveClient
    const log = new GoogleDriveOperationLog(client, 'root')

    await expect(log.get('target')).resolves.toEqual(documentUpdate(1, 'target'))
    expect(client.findOperation).toHaveBeenCalledWith('operations', 'target')
    expect(client.listChildren).not.toHaveBeenCalled()
    expect(client.download).toHaveBeenCalledTimes(1)
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
