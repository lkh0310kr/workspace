/// <reference types="@cloudflare/workers-types" />

import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleVaultRequest } from '../../../../pkms-server/src/SupabaseVault'

describe('PKMS content search API boundary', () => {
  const invalidCases: Array<[Record<string, unknown>, string]> = [
    [{ query: '' }, 'empty query'],
    [{ query: 'x'.repeat(201) }, 'overlong query'],
    [{ query: 'needle', caseSensitive: 'yes' }, 'invalid case mode'],
    [{ query: 'needle', afterPath: '../outside.md' }, 'invalid path cursor']
  ]

  afterEach(() => vi.unstubAllGlobals())

  it('passes query, case mode, and pagination cursor to the workspace RPC', async () => {
    const rpcResult = {
      results: [{ fileId: 'file-2', path: 'docs/needle.md', matches: [{ line: 2, column: 4, preview: 'needle' }] }],
      indexedFiles: 42,
      searchableFiles: 45,
      pendingFiles: 3,
      hasMore: true,
      nextPath: 'docs/needle.md'
    }
    const requests: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input)
        requests.push({ url, init })
        if (url.includes('/rest/v1/pkms_workspaces?'))
          return Response.json([{ workspace_id: 'workspace-1', owner_login: 'lkh0310kr' }])
        if (url.endsWith('/rest/v1/rpc/pkms_search_content')) return Response.json(rpcResult)
        throw new Error(`Unexpected Supabase request: ${url}`)
      })
    )

    const response = await handleVaultRequest(
      { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-key' } as never,
      'lkh0310kr',
      'workspace-1',
      new Request('https://pkms.example/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'needle', caseSensitive: true, afterPath: 'docs/alpha.md' })
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(rpcResult)
    const rpcRequest = requests.find(({ url }) => url.endsWith('/rest/v1/rpc/pkms_search_content'))
    expect(rpcRequest).toBeDefined()
    expect(JSON.parse(String(rpcRequest?.init.body))).toEqual({
      p_workspace_id: 'workspace-1',
      p_query: 'needle',
      p_case_sensitive: true,
      p_after_path: 'docs/alpha.md'
    })
  })

  it.each(invalidCases)('rejects an invalid search request before calling the search RPC (%s)', async (body) => {
    const requests: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        requests.push(url)
        if (url.includes('/rest/v1/pkms_workspaces?'))
          return Response.json([{ workspace_id: 'workspace-1', owner_login: 'lkh0310kr' }])
        throw new Error(`Search RPC should not run: ${url}`)
      })
    )

    const response = await handleVaultRequest(
      { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-key' } as never,
      'lkh0310kr',
      'workspace-1',
      new Request('https://pkms.example/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    )

    expect(response.status).toBe(400)
    expect(requests.some((url) => url.endsWith('/rest/v1/rpc/pkms_search_content'))).toBe(false)
  })
})
