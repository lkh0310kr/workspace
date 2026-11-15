const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  modifiedTime?: string
  md5Checksum?: string
  size?: string
  trashed?: boolean
  appProperties?: Record<string, string>
  webViewLink?: string
}

export interface DriveChange {
  fileId: string
  removed?: boolean
  file?: DriveFile
}

export interface DriveChangePage {
  changes: DriveChange[]
  nextPageToken?: string
  newStartPageToken?: string
}

export interface DriveListOptions {
  query?: string
  pageSize?: number
  fields?: string
  orderBy?: string
  pageToken?: string
  signal?: AbortSignal
}

export interface DriveRequestOptions extends RequestInit {
  /** Mutations default to no retries because Drive does not promise request idempotency. */
  retryable?: boolean
}

export interface DriveRetryOptions {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export interface DriveAccessTokenProvider {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>
}

export class DriveAuthenticationRequiredError extends Error {
  constructor(message = 'Reconnect Google Drive to continue syncing.') {
    super(message)
    this.name = 'DriveAuthenticationRequiredError'
  }
}

export class DriveApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
    message: string,
    readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = 'DriveApiError'
  }
}

type DriveErrorBody = {
  error?: {
    message?: string
    errors?: Array<{ reason?: string }>
  }
}

interface GoogleDriveClientOptions {
  tokenProvider: DriveAccessTokenProvider
  fetcher?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  retry?: DriveRetryOptions
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
}

function retryableStatus(status: number, reason: string | null): boolean {
  return (
    status === 429 ||
    status >= 500 ||
    (status === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded'))
  )
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

async function errorFromResponse(response: Response): Promise<DriveApiError> {
  const body = (await response.json().catch(() => ({}))) as DriveErrorBody
  const reason = body.error?.errors?.find((item) => item.reason)?.reason ?? null
  return new DriveApiError(
    response.status,
    reason,
    body.error?.message ?? `Google Drive API request failed (${response.status}).`,
    retryAfter(response)
  )
}

function queryLiteral(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function arrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

export class GoogleDriveClient {
  private readonly fetcher: typeof fetch
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly random: () => number
  private readonly retry: Required<DriveRetryOptions>

  constructor(private readonly options: GoogleDriveClientOptions) {
    this.fetcher = options.fetcher ?? fetch
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
    this.random = options.random ?? Math.random
    this.retry = {
      attempts: Math.max(1, options.retry?.attempts ?? 5),
      baseDelayMs: Math.max(1, options.retry?.baseDelayMs ?? 500),
      maxDelayMs: Math.max(1, options.retry?.maxDelayMs ?? 30_000)
    }
  }

  async request<T>(url: string, init: DriveRequestOptions = {}): Promise<T> {
    const { retryable = init.method === undefined || init.method === 'GET', ...requestInit } = init
    const maxAttempts = retryable ? this.retry.attempts : 1
    let refreshedAfter401 = false
    let lastError: unknown
    let retryAttempt = 0

    while (retryAttempt < maxAttempts) {
      abortIfNeeded(requestInit.signal ?? undefined)
      const token = await this.options.tokenProvider.getAccessToken({
        forceRefresh: refreshedAfter401
      })
      const headers = new Headers(requestInit.headers)
      headers.set('Authorization', `Bearer ${token}`)
      const response = await this.fetcher(url, { ...requestInit, headers })

      if (response.status === 401 && !refreshedAfter401) {
        refreshedAfter401 = true
        // Credential renewal is not a mutation retry. Retry the same request
        // once with a newly issued token, even when the request is non-idempotent.
        continue
      }
      if (response.ok) {
        if (response.status === 204) return undefined as T
        return (await response.json()) as T
      }

      const error = await errorFromResponse(response)
      lastError = error
      if (
        !retryable ||
        !retryableStatus(error.status, error.reason) ||
        retryAttempt + 1 >= maxAttempts
      )
        throw error
      await this.sleep(this.delayFor(retryAttempt, error.retryAfterMs))
      retryAttempt += 1
    }

    throw lastError ?? new Error('Google Drive request did not complete.')
  }

  async getFile(fileId: string, signal?: AbortSignal): Promise<DriveFile> {
    const fields =
      'id,name,mimeType,parents,modifiedTime,md5Checksum,size,trashed,appProperties,webViewLink'
    return this.request<DriveFile>(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`,
      { signal }
    )
  }

  async listFiles(options: DriveListOptions = {}): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken = options.pageToken
    do {
      const query = new URLSearchParams({
        pageSize: String(Math.max(1, Math.min(options.pageSize ?? 1000, 1000))),
        fields: `nextPageToken,files(${options.fields ?? 'id,name,mimeType,parents,modifiedTime,md5Checksum,size,trashed,appProperties,webViewLink'})`
      })
      if (options.query) query.set('q', options.query)
      if (options.orderBy) query.set('orderBy', options.orderBy)
      if (pageToken) query.set('pageToken', pageToken)
      const page = await this.request<{ files?: DriveFile[]; nextPageToken?: string }>(
        `${DRIVE_API}/files?${query}`,
        { signal: options.signal }
      )
      files.push(...(page.files ?? []))
      pageToken = page.nextPageToken
    } while (pageToken)
    return files
  }

  async listChildren(parentId: string, signal?: AbortSignal): Promise<DriveFile[]> {
    return this.listFiles({
      query: `${queryLiteral(parentId)} in parents and trashed = false`,
      orderBy: 'folder,name',
      signal
    })
  }

  async ensureFolder(name: string, parentId: string | null): Promise<DriveFile> {
    const parentFilter = parentId ? `${queryLiteral(parentId)} in parents and ` : ''
    const matches = await this.listFiles({
      query: `${parentFilter}name = ${queryLiteral(name)} and mimeType = ${queryLiteral(DRIVE_FOLDER_MIME)} and trashed = false`,
      pageSize: 100,
      fields: 'id,name,mimeType,parents,trashed,webViewLink'
    })
    if (matches.length > 1)
      throw new DriveApiError(
        409,
        'duplicateFolder',
        `More than one Drive folder is named "${name}".`
      )
    if (matches[0]) return matches[0]
    return this.createFolder(name, parentId)
  }

  async createFolder(
    name: string,
    parentId: string | null,
    appProperties?: Record<string, string>
  ): Promise<DriveFile> {
    return this.request<DriveFile>(
      `${DRIVE_API}/files?fields=id,name,mimeType,parents,webViewLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: DRIVE_FOLDER_MIME,
          ...(parentId ? { parents: [parentId] } : {}),
          ...(appProperties ? { appProperties } : {})
        }),
        retryable: false
      }
    )
  }

  async createFile(
    name: string,
    parentId: string,
    mimeType: string,
    bytes: Uint8Array,
    appProperties?: Record<string, string>
  ): Promise<DriveFile> {
    const metadata = {
      name,
      mimeType,
      parents: [parentId],
      ...(appProperties ? { appProperties } : {})
    }
    return this.createMediaFile(metadata, bytes, mimeType)
  }

  async createMediaFile(
    metadata: Record<string, unknown>,
    bytes: Uint8Array,
    mimeType = 'application/octet-stream'
  ): Promise<DriveFile> {
    const boundary = `pkms-${crypto.randomUUID()}`
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
        arrayBufferCopy(bytes),
        `\r\n--${boundary}--`
      ],
      { type: `multipart/related; boundary=${boundary}` }
    )
    return this.request<DriveFile>(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime,md5Checksum,size,appProperties,webViewLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
        retryable: false
      }
    )
  }

  async uploadMedia(fileId: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    return this.request<DriveFile>(
      `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,mimeType,parents,modifiedTime,md5Checksum,size,appProperties,webViewLink`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType },
        body: new Blob([arrayBufferCopy(bytes)], { type: mimeType }),
        retryable: false
      }
    )
  }

  async updateFileMetadata(
    fileId: string,
    metadata: Record<string, unknown>,
    options: { addParents?: string; removeParents?: string } = {}
  ): Promise<DriveFile> {
    const query = new URLSearchParams({
      fields:
        'id,name,mimeType,parents,modifiedTime,md5Checksum,size,trashed,appProperties,webViewLink'
    })
    if (options.addParents) query.set('addParents', options.addParents)
    if (options.removeParents) query.set('removeParents', options.removeParents)
    return this.request<DriveFile>(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${query}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
      retryable: false
    })
  }

  async trashFile(fileId: string): Promise<DriveFile> {
    return this.updateFileMetadata(fileId, { trashed: true })
  }

  async download(fileId: string, signal?: AbortSignal): Promise<Uint8Array> {
    const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`
    let refreshedAfter401 = false
    let retryAttempt = 0
    while (retryAttempt < this.retry.attempts) {
      abortIfNeeded(signal)
      const token = await this.options.tokenProvider.getAccessToken({
        forceRefresh: refreshedAfter401
      })
      const response = await this.fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal
      })
      if (response.status === 401 && !refreshedAfter401) {
        refreshedAfter401 = true
        continue
      }
      if (response.ok) return new Uint8Array(await response.arrayBuffer())

      const error = await errorFromResponse(response)
      if (!retryableStatus(error.status, error.reason) || retryAttempt + 1 >= this.retry.attempts)
        throw error
      await this.sleep(this.delayFor(retryAttempt, error.retryAfterMs))
      retryAttempt += 1
    }
    throw new Error('Google Drive download did not complete.')
  }

  async startChanges(): Promise<string> {
    const response = await this.request<{ startPageToken: string }>(
      `${DRIVE_API}/changes/startPageToken?fields=startPageToken`
    )
    return response.startPageToken
  }

  async listChangesPage(pageToken: string, signal?: AbortSignal): Promise<DriveChangePage> {
    const query = new URLSearchParams({
      pageToken,
      pageSize: '1000',
      includeRemoved: 'true',
      fields:
        'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,parents,modifiedTime,md5Checksum,size,trashed,appProperties))'
    })
    return this.request<DriveChangePage>(`${DRIVE_API}/changes?${query}`, { signal })
  }

  async findOperation(parentId: string, operationId: string): Promise<DriveFile[]> {
    return this.listFiles({
      query: `${queryLiteral(parentId)} in parents and appProperties has { key='pkmsOperationId' and value=${queryLiteral(operationId)} } and trashed = false`,
      pageSize: 100,
      fields: 'id,name,mimeType,parents,modifiedTime,md5Checksum,size,appProperties'
    })
  }

  async createImmutableOperation(
    parentId: string,
    operationId: string,
    content: Uint8Array,
    sha256: string,
    operationProperties: Record<string, string> = {}
  ): Promise<DriveFile> {
    const existing = await this.findOperation(parentId, operationId)
    const matching = existing.find((file) => file.appProperties?.pkmsPayloadSha256 === sha256)
    if (matching) return matching
    if (existing.length)
      throw new DriveApiError(
        409,
        'operationIdCollision',
        'The operation ID is already used for different content.'
      )

    try {
      return await this.createFile(
        `op-${operationId}.json`,
        parentId,
        'application/json',
        content,
        {
          ...operationProperties,
          pkmsOperationId: operationId,
          pkmsPayloadSha256: sha256
        }
      )
    } catch (error) {
      // POST may have reached Drive even when its response was lost. Search by
      // stable operation ID; the durable local outbox remains until this works.
      const recovered = await this.findOperation(parentId, operationId).catch(() => [])
      const recoveredMatch = recovered.find(
        (file) => file.appProperties?.pkmsPayloadSha256 === sha256
      )
      if (recoveredMatch) return recoveredMatch
      throw error
    }
  }

  private delayFor(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined) return Math.min(this.retry.maxDelayMs, retryAfterMs)
    const ceiling = Math.min(this.retry.maxDelayMs, this.retry.baseDelayMs * 2 ** attempt)
    return Math.floor(ceiling * (0.5 + this.random() * 0.5))
  }
}

/** Apply the complete change-feed transaction before durably advancing its cursor. */
export async function applyDriveChanges(options: {
  client: Pick<GoogleDriveClient, 'listChangesPage'>
  cursor: string
  apply: (changes: readonly DriveChange[]) => Promise<void>
  saveCursor: (cursor: string) => Promise<void>
  signal?: AbortSignal
  maxPages?: number
}): Promise<{ cursor: string; changesApplied: number; pages: number }> {
  const changes: DriveChange[] = []
  let requestToken = options.cursor
  let nextCursor: string | undefined
  let pages = 0
  const maxPages = options.maxPages ?? 10_000

  while (pages < maxPages) {
    abortIfNeeded(options.signal)
    const page = await options.client.listChangesPage(requestToken, options.signal)
    pages += 1
    changes.push(...(page.changes ?? []))
    if (page.nextPageToken) {
      requestToken = page.nextPageToken
      continue
    }
    nextCursor = page.newStartPageToken
    break
  }

  if (!nextCursor)
    throw new Error(`Drive change feed did not reach its final page within ${maxPages} pages.`)
  abortIfNeeded(options.signal)
  await options.apply(changes)
  abortIfNeeded(options.signal)
  await options.saveCursor(nextCursor)
  return { cursor: nextCursor, changesApplied: changes.length, pages }
}
