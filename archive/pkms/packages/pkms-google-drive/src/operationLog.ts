import { GoogleDriveClient, type DriveFile } from './googleDriveClient'
import type { DriveOutboxOperation } from './outbox'
import { sha256Hex } from './sha256'

export interface DriveLogicalOperation {
  version: 1
  workspaceRootId: string
  operationId: string
  deviceId: string
  sequence: number
  createdAt: number
  mutation: DriveOutboxOperation['mutation']
}

export interface DriveOperationChangeBatch {
  operations: DriveLogicalOperation[]
  cursor: string
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
      if (typeof value.mutation.fileId !== 'string' || typeof value.mutation.text !== 'string')
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
    const digest = await sha256Hex(bytes)
    const folder = await this.getOperationsFolder()
    const mutation = operation.mutation
    const operationProperties: Record<string, string> = {
      pkmsWorkspaceRootId: this.workspaceRootId,
      pkmsOperationType: mutation.type,
      pkmsDeviceId: operation.deviceId,
      pkmsSequence: String(operation.sequence)
    }
    if ('fileId' in mutation) operationProperties.pkmsFileId = mutation.fileId
    return this.client.createImmutableOperation(
      folder.id,
      operation.operationId,
      bytes,
      digest,
      operationProperties
    )
  }

  /** Captures the current Drive boundary without replaying the workspace's old operation history. */
  initializeCursor(): Promise<string> {
    return this.client.startChanges()
  }

  /** Reads only operation records created since this replica's durable Drive changes cursor. */
  async listChanges(
    cursor: string,
    appliedOperationIds: ReadonlySet<string>
  ): Promise<DriveOperationChangeBatch> {
    const folder = await this.getOperationsFolder()
    const changedFiles = new Map<string, DriveFile>()
    let requestToken = cursor
    let nextCursor: string | undefined
    let pages = 0
    while (pages < 10_000) {
      const page = await this.client.listChangesPage(requestToken)
      pages += 1
      for (const change of page.changes ?? []) {
        const file = change.file
        if (
          change.removed ||
          !file ||
          file.trashed ||
          !file.parents?.includes(folder.id) ||
          !file.appProperties?.pkmsOperationId ||
          appliedOperationIds.has(file.appProperties.pkmsOperationId)
        )
          continue
        changedFiles.set(file.id, file)
      }
      if (page.nextPageToken) {
        requestToken = page.nextPageToken
        continue
      }
      nextCursor = page.newStartPageToken
      break
    }
    if (!nextCursor) throw new Error('Google Drive operation changes did not reach a final page.')

    const operations: DriveLogicalOperation[] = []
    for (const file of changedFiles.values()) {
      const operation = await this.readOperationFile(file)
      operations.push(operation)
    }
    operations.sort(compareOperations)
    return { operations, cursor: nextCursor }
  }

  /** Reads the CRDT history for one document when that document is opened. */
  async listDocumentOperations(fileId: string): Promise<DriveLogicalOperation[]> {
    const folder = await this.getOperationsFolder()
    const files = await this.client.listFiles({
      query: `${queryLiteral(folder.id)} in parents and appProperties has { key='pkmsFileId' and value=${queryLiteral(fileId)} } and trashed = false`,
      pageSize: 1000,
      fields: 'id,name,mimeType,parents,modifiedTime,appProperties'
    })
    const operations: DriveLogicalOperation[] = []
    for (const file of files) {
      if (
        !['document-seed', 'document-update'].includes(file.appProperties?.pkmsOperationType ?? '')
      )
        continue
      const operation = await this.readOperationFile(file)
      if (
        (operation.mutation.type === 'document-seed' ||
          operation.mutation.type === 'document-update') &&
        operation.mutation.fileId === fileId
      )
        operations.push(operation)
    }
    operations.sort(compareOperations)
    return operations
  }

  /** Reads immutable binary replacement versions for one asset only. */
  async listAssetReplacementOperations(fileId: string): Promise<DriveLogicalOperation[]> {
    const folder = await this.getOperationsFolder()
    const files = await this.client.listFiles({
      query: `${queryLiteral(folder.id)} in parents and appProperties has { key='pkmsFileId' and value=${queryLiteral(fileId)} } and trashed = false`,
      pageSize: 1000,
      fields: 'id,name,mimeType,parents,modifiedTime,appProperties'
    })
    const operations: DriveLogicalOperation[] = []
    for (const file of files) {
      if (file.appProperties?.pkmsOperationType !== 'replace-content') continue
      const operation = await this.readOperationFile(file)
      if (operation.mutation.type === 'replace-content' && operation.mutation.fileId === fileId)
        operations.push(operation)
    }
    operations.sort(compareOperations)
    return operations
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

    const operation = await this.readOperationFile(file)
    if (operation.operationId !== operationId)
      throw new Error(`Operation identity mismatch for Drive file ${file.id}.`)
    return operation
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

  private async readOperationFile(file: DriveFile): Promise<DriveLogicalOperation> {
    if (file.mimeType === 'application/vnd.google-apps.folder')
      throw new Error('Unexpected folder found in the Google Drive operation log.')
    const bytes = await this.client.download(file.id)
    const operation = decodeDriveLogicalOperation(bytes)
    if (operation.workspaceRootId !== this.workspaceRootId)
      throw new Error(`Operation ${operation.operationId} belongs to another workspace.`)
    if (file.appProperties?.pkmsOperationId !== operation.operationId)
      throw new Error(`Operation identity mismatch for Drive file ${file.id}.`)
    if (file.appProperties?.pkmsPayloadSha256 !== (await sha256Hex(bytes)))
      throw new Error(`Operation payload checksum mismatch for Drive file ${file.id}.`)
    if (
      file.appProperties?.pkmsWorkspaceRootId &&
      file.appProperties.pkmsWorkspaceRootId !== this.workspaceRootId
    )
      throw new Error(`Operation ${operation.operationId} belongs to another workspace.`)
    return operation
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

function compareOperations(left: DriveLogicalOperation, right: DriveLogicalOperation): number {
  return (
    left.sequence - right.sequence ||
    left.deviceId.localeCompare(right.deviceId) ||
    left.operationId.localeCompare(right.operationId)
  )
}

function queryLiteral(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}
