import { describe, expect, it, vi } from 'vitest'
import {
  DriveApiError,
  GoogleDriveClient,
  applyDriveChanges,
  type DriveAccessTokenProvider
} from '../../../../../packages/pkms-google-drive/src'

function tokenProvider(tokens: string[] = ['access-token']): DriveAccessTokenProvider {
  let index = 0
  return {
    getAccessToken: vi.fn(async () => tokens[Math.min(index++, tokens.length - 1)])
  }
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) }
  })
}

describe('Google Drive direct client', () => {
  it('paginates file listings and uses the direct Drive API with the injected token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'folder-a', name: 'A', mimeType: 'folder' }],
          nextPageToken: 'next'
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'folder-b', name: 'B', mimeType: 'folder' }] })
      )
    const client = new GoogleDriveClient({ tokenProvider: tokenProvider(), fetcher })

    const files = await client.listChildren('parent-id')

    expect(files.map((file) => file.id)).toEqual(['folder-a', 'folder-b'])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toContain('https://www.googleapis.com/drive/v3/files?')
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('q')).toBe(
      "'parent-id' in parents and trashed = false"
    )
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer access-token'
    )
    expect(fetcher.mock.calls[1][0]).toContain('pageToken=next')
  })

  it('renews a rejected access token once, including for a non-retryable mutation', async () => {
    const provider = tokenProvider(['expired', 'renewed'])
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'created', name: 'folder', mimeType: 'folder' }, 200)
      )
    const client = new GoogleDriveClient({ tokenProvider: provider, fetcher })

    const file = await client.createFolder('folder', null)

    expect(file.id).toBe('created')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer expired'
    )
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe(
      'Bearer renewed'
    )
    expect(provider.getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true })
  })

  it('sends stable PKMS item identity markers in direct Drive create requests', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ id: 'drive-file-id', name: 'note.md', mimeType: 'text/markdown' })
      )
    const client = new GoogleDriveClient({ tokenProvider: tokenProvider(), fetcher })
    const appProperties = {
      pkmsWorkspaceRootId: 'workspace-root',
      pkmsCreateOperationId: 'operation-id',
      pkmsItemId: 'stable-item-id',
      pkmsCreatePayloadSha256: 'payload-hash'
    }

    await client.createFile(
      'note.md',
      'parent-id',
      'text/markdown',
      new TextEncoder().encode('hello'),
      appProperties
    )

    const body = await (fetcher.mock.calls[0][1]?.body as Blob).text()
    expect(body).toContain(
      JSON.stringify({
        name: 'note.md',
        mimeType: 'text/markdown',
        parents: ['parent-id'],
        appProperties
      })
    )
  })

  it('backs off on Drive 429 and then retries an idempotent read', async () => {
    const sleep = vi.fn(async () => {})
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'rate limited' } }, 429, { 'Retry-After': '2' })
      )
      .mockResolvedValueOnce(jsonResponse({ startPageToken: 'cursor-5' }))
    const client = new GoogleDriveClient({
      tokenProvider: tokenProvider(),
      fetcher,
      sleep,
      retry: { attempts: 3, maxDelayMs: 5000 }
    })

    await expect(client.startChanges()).resolves.toBe('cursor-5')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('refreshes auth and retries binary downloads after a rate limit', async () => {
    const provider = tokenProvider(['expired', 'renewed'])
    const sleep = vi.fn(async () => {})
    const bytes = new Uint8Array([0, 255, 3, 128])
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429))
      .mockResolvedValueOnce(new Response(bytes))
    const client = new GoogleDriveClient({ tokenProvider: provider, fetcher, sleep })

    await expect(client.download('asset-id')).resolves.toEqual(bytes)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledOnce()
    expect(provider.getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true })
  })

  it('does not blindly retry a create after a server error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { message: 'failed' } }, 503))
    const client = new GoogleDriveClient({ tokenProvider: tokenProvider(), fetcher })

    await expect(client.createFolder('folder', null)).rejects.toMatchObject({ status: 503 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('recovers a lost immutable-operation ACK by its stable operation ID and payload hash', async () => {
    let created = false
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/files?') && init?.method === undefined) {
        return jsonResponse({
          files: created
            ? [
                {
                  id: 'operation-file',
                  name: 'op-operation-1.json',
                  mimeType: 'application/json',
                  appProperties: {
                    pkmsOperationId: 'operation-1',
                    pkmsPayloadSha256: 'payload-sha'
                  }
                }
              ]
            : []
        })
      }
      if (url.includes('/upload/drive/v3/files?uploadType=multipart')) {
        created = true
        throw new TypeError('simulated lost response')
      }
      return jsonResponse({ error: { message: 'unexpected request' } }, 500)
    })
    const client = new GoogleDriveClient({ tokenProvider: tokenProvider(), fetcher })

    const recovered = await client.createImmutableOperation(
      'operations-folder',
      'operation-1',
      new TextEncoder().encode('{"kind":"update"}'),
      'payload-sha'
    )

    expect(recovered.id).toBe('operation-file')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('keeps the old cursor when any change page fails or local application fails', async () => {
    const oldCursor = 'cursor-5'
    const saveCursor = vi.fn(async () => {})
    const apply = vi.fn(async () => {
      throw new Error('local durable apply failed')
    })
    const client = {
      listChangesPage: vi
        .fn()
        .mockResolvedValueOnce({ changes: [{ fileId: 'f1' }], nextPageToken: 'page-2' })
        .mockResolvedValueOnce({ changes: [{ fileId: 'f2' }], newStartPageToken: 'cursor-9' })
    }

    await expect(
      applyDriveChanges({ client, cursor: oldCursor, apply, saveCursor })
    ).rejects.toThrow('local durable apply failed')
    expect(client.listChangesPage.mock.calls.map(([cursor]) => cursor)).toEqual([
      oldCursor,
      'page-2'
    ])
    expect(apply).toHaveBeenCalledWith([{ fileId: 'f1' }, { fileId: 'f2' }])
    expect(saveCursor).not.toHaveBeenCalled()
  })

  it('commits the new cursor only after every page has been durably applied', async () => {
    const calls: string[] = []
    const client = {
      listChangesPage: vi
        .fn()
        .mockResolvedValueOnce({ changes: [{ fileId: 'f1' }], nextPageToken: 'page-2' })
        .mockResolvedValueOnce({ changes: [{ fileId: 'f2' }], newStartPageToken: 'cursor-9' })
    }

    const result = await applyDriveChanges({
      client,
      cursor: 'cursor-5',
      apply: async (changes) => {
        calls.push(`apply:${changes.map((change) => change.fileId).join(',')}`)
      },
      saveCursor: async (cursor) => {
        calls.push(`cursor:${cursor}`)
      }
    })

    expect(result).toEqual({ cursor: 'cursor-9', changesApplied: 2, pages: 2 })
    expect(calls).toEqual(['apply:f1,f2', 'cursor:cursor-9'])
  })

  it('exposes structured API status and rate-limit reason to the caller', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: 'too many', errors: [{ reason: 'userRateLimitExceeded' }] } },
          403
        )
      )
    const client = new GoogleDriveClient({
      tokenProvider: tokenProvider(),
      fetcher,
      retry: { attempts: 1 }
    })

    const failure = client.startChanges()
    await expect(failure).rejects.toBeInstanceOf(DriveApiError)
    await expect(failure).rejects.toMatchObject({ status: 403, reason: 'userRateLimitExceeded' })
  })
})
