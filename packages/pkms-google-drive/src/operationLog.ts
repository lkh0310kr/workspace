import { GoogleDriveClient, type DriveFile } from './googleDriveClient'
import type { DriveOutboxOperation } from './outbox'

export interface DriveLogicalOperation {
  version: 1
  workspaceRootId: string
  operationId: string
  deviceId: string
  sequence: number
  createdAt: number
  mutation: DriveOutboxOperation['mutation']
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))
    )
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function encodeDriveLogicalOperation(operation: DriveLogicalOperation): Uint8Array {
  const mutation =
    operation.mutation.type === 'document-update'
      ? { ...operation.mutation, update: bytesToBase64(operation.mutation.update) }
      : operation.mutation.type === 'create-file'
        ? { ...operation.mutation, bytes: bytesToBase64(operation.mutation.bytes) }
        : operation.mutation
  return new TextEncoder().encode(JSON.stringify({ ...operation, mutation }))
}

export function decodeDriveLogicalOperation(bytes: Uint8Array): DriveLogicalOperation {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as DriveLogicalOperation & {
    mutation: Record<string, unknown>
  }
  if (
    value.version !== 1 ||
    !value.workspaceRootId ||
    !value.operationId ||
    !value.deviceId ||
    !Number.isSafeInteger(value.sequence) ||
    !Number.isFinite(value.createdAt) ||
    !value.mutation ||
    typeof value.mutation.type !== 'string'
  )
    throw new Error('The Google Drive operation record is malformed or unsupported.')

  const mutationType = (value.mutation as { type?: unknown }).type
  switch (value.mutation.type) {
    case 'create-folder':
      if (
        typeof value.mutation.path !== 'string' ||
        (value.mutation.itemId !== undefined && typeof value.mutation.itemId !== 'string')
      )
        throw new Error('The Google Drive folder creation operation is malformed.')
      break
    case 'create-file':
      if (
        typeof value.mutation.path !== 'string' ||
        typeof value.mutation.mimeType !== 'string' ||
        typeof value.mutation.bytes !== 'string' ||
        (value.mutation.itemId !== undefined && typeof value.mutation.itemId !== 'string')
      )
        throw new Error('The Google Drive file creation operation is malformed.')
      value.mutation.bytes = base64ToBytes(value.mutation.bytes)
      break
    case 'document-update':
      if (typeof value.mutation.update !== 'string' || typeof value.mutation.fileId !== 'string')
        throw new Error('The Google Drive document update operation is malformed.')
      value.mutation.update = base64ToBytes(value.mutation.update)
      break
    case 'document-seed':
      if (
        typeof value.mutation.fileId !== 'string' ||
        typeof value.mutation.text !== 'string'
      )
        throw new Error('The Google Drive document seed operation is malformed.')
      break
    case 'replace-content':
      if (
        typeof value.mutation.fileId !== 'string' ||
        typeof value.mutation.mimeType !== 'string' ||
        typeof value.mutation.bytes !== 'string'
      )
        throw new Error('The Google Drive content replacement operation is malformed.')
      value.mutation.bytes = base64ToBytes(value.mutation.bytes)
      break
    case 'rename':
      if (typeof value.mutation.fileId !== 'string' || typeof value.mutation.name !== 'string')
        throw new Error('The Google Drive rename operation is malformed.')
      break
    case 'move':
      if (
        typeof value.mutation.fileId !== 'string' ||
        typeof value.mutation.targetDirectoryPath !== 'string'
      )
        throw new Error('The Google Drive move operation is malformed.')
      break
    case 'trash':
      if (typeof value.mutation.fileId !== 'string')
        throw new Error('The Google Drive trash operation is malformed.')
      break
    default:
      throw new Error(`Unsupported Google Drive operation type: ${String(mutationType)}`)
  }
  return value as DriveLogicalOperation
}

/** Append-only Drive operation log. File content is the protocol record; appProperties index retries. */
export class GoogleDriveOperationLog {
  private protocolFolder?: Promise<DriveFile>
  private operationsFolder?: Promise<DriveFile>

  constructor(
    private readonly client: GoogleDriveClient,
    readonly workspaceRootId: string
  ) {}

  async append(operation: DriveLogicalOperation): Promise<DriveFile> {
    if (operation.workspaceRootId !== this.workspaceRootId)
      throw new Error('The operation belongs to a different Google Drive workspace.')
    const bytes = encodeDriveLogicalOperation(operation)
    const digest = await sha256(bytes)
    const folder = await this.getOperationsFolder()
    return this.client.createImmutableOperation(folder.id, operation.operationId, bytes, digest)
  }

  /** Reads one operation by its stable ID without downloading the workspace log. */
  async get(operationId: string): Promise<DriveLogicalOperation | null> {
    const folder = await this.getOperationsFolder()
    const files = await this.client.findOperation(folder.id, operationId)
    if (files.length > 1)
      throw new Error(`Multiple Google Drive records use operation ID ${operationId}.`)
    const file = files[0]
    if (!file) return null
    if (file.mimeType === 'application/vnd.google-apps.folder')
      throw new Error('Unexpected folder found in the Google Drive operation log.')

    const bytes = await this.client.download(file.id)
    const operation = decodeDriveLogicalOperation(bytes)
    if (operation.workspaceRootId !== this.workspaceRootId)
      throw new Error(`Operation ${operation.operationId} belongs to another workspace.`)
    if (file.appProperties?.pkmsOperationId !== operation.operationId)
      throw new Error(`Operation identity mismatch for Drive file ${file.id}.`)
    if (operation.operationId !== operationId)
      throw new Error(`Operation identity mismatch for Drive file ${file.id}.`)
    if (file.appProperties?.pkmsPayloadSha256 !== (await sha256(bytes)))
      throw new Error(`Operation payload checksum mismatch for Drive file ${file.id}.`)
    return operation
  }

  async list(): Promise<DriveLogicalOperation[]> {
    const folder = await this.getOperationsFolder()
    const files = await this.client.listChildren(folder.id)
    const operations: DriveLogicalOperation[] = []
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder')
        throw new Error('Unexpected folder found in the Google Drive operation log.')
      const bytes = await this.client.download(file.id)
      const operation = decodeDriveLogicalOperation(bytes)
      if (operation.workspaceRootId !== this.workspaceRootId)
        throw new Error(`Operation ${operation.operationId} belongs to another workspace.`)
      if (file.appProperties?.pkmsOperationId !== operation.operationId)
        throw new Error(`Operation identity mismatch for Drive file ${file.id}.`)
      if (file.appProperties?.pkmsPayloadSha256 !== (await sha256(bytes)))
        throw new Error(`Operation payload checksum mismatch for Drive file ${file.id}.`)
      operations.push(operation)
    }
    return operations.sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.deviceId.localeCompare(right.deviceId) ||
        left.operationId.localeCompare(right.operationId)
    )
  }

  async listUnapplied(appliedOperationIds: ReadonlySet<string>): Promise<DriveLogicalOperation[]> {
    const folder = await this.getOperationsFolder()
    const files = await this.client.listChildren(folder.id)
    const operations: DriveLogicalOperation[] = []
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder')
        throw new Error('Unexpected folder found in the Google Drive operation log.')
      const operationId = file.appProperties?.pkmsOperationId
      if (!operationId) throw new Error(`Drive operation ${file.id} has no stable operation ID.`)
      if (appliedOperationIds.has(operationId)) continue
      const bytes = await this.client.download(file.id)
      const operation = decodeDriveLogicalOperation(bytes)
      if (operation.workspaceRootId !== this.workspaceRootId)
        throw new Error(`Operation ${operation.operationId} belongs to another workspace.`)
      if (operationId !== operation.operationId)
        throw new Error(`Operation identity mismatch for Drive file ${file.id}.`)
      if (file.appProperties?.pkmsPayloadSha256 !== (await sha256(bytes)))
        throw new Error(`Operation payload checksum mismatch for Drive file ${file.id}.`)
      operations.push(operation)
    }
    return operations.sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.deviceId.localeCompare(right.deviceId) ||
        left.operationId.localeCompare(right.operationId)
    )
  }

  private getProtocolFolder(): Promise<DriveFile> {
    if (!this.protocolFolder)
      this.protocolFolder = this.client
        .ensureFolder('.pkms-sync', this.workspaceRootId)
        .catch((cause) => {
          this.protocolFolder = undefined
          throw cause
        })
    return this.protocolFolder
  }

  private getOperationsFolder(): Promise<DriveFile> {
    if (!this.operationsFolder)
      this.operationsFolder = this.getProtocolFolder()
        .then((protocol) => this.client.ensureFolder('operations', protocol.id))
        .catch((cause) => {
          this.operationsFolder = undefined
          throw cause
        })
    return this.operationsFolder
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
