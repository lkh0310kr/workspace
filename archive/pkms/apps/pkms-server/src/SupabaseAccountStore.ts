import type { Env, WorkspaceRecord } from './env'
import { decryptSecret, encryptSecret, json } from './crypto'
import { supabaseRequest } from './supabase'

interface AccountValue {
  value: unknown
}

async function readValue(env: Env, login: string, key: string): Promise<unknown | null> {
  const query = new URLSearchParams({
    account_login: `eq.${login.toLowerCase()}`,
    value_key: `eq.${key}`,
    select: 'value',
    limit: '1'
  })
  const response = await supabaseRequest(env, `/rest/v1/pkms_account_values?${query}`)
  const rows = (await response.json()) as AccountValue[]
  return rows[0]?.value ?? null
}

async function writeValue(env: Env, login: string, key: string, value: unknown): Promise<void> {
  await supabaseRequest(env, '/rest/v1/pkms_account_values?on_conflict=account_login,value_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ account_login: login.toLowerCase(), value_key: key, value })
  })
}

async function deleteValue(env: Env, login: string, key: string): Promise<void> {
  await supabaseRequest(env, '/rest/v1/rpc/pkms_delete_account_value', {
    method: 'POST',
    body: JSON.stringify({ p_login: login.toLowerCase(), p_key: key })
  })
}

export async function getAccountValue(
  env: Env,
  login: string,
  key: string
): Promise<unknown | null> {
  return readValue(env, login, key)
}

export async function putAccountValue(
  env: Env,
  login: string,
  key: string,
  value: unknown
): Promise<void> {
  await writeValue(env, login, key, value)
}

export async function removeAccountValue(env: Env, login: string, key: string): Promise<void> {
  await deleteValue(env, login, key)
}

export function accountStore(
  env: Env,
  login: string
): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> } {
  const owner = login.toLowerCase()
  return {
    fetch: (input, init) =>
      handleAccountRequest(env, owner, input instanceof Request ? input : new Request(input, init))
  }
}

async function handleAccountRequest(env: Env, owner: string, request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/credentials') {
    const value = await readValue(env, owner, 'credentials')
    if (typeof value !== 'string') return json({ error: 'not_connected' }, { status: 404 })
    try {
      return json(JSON.parse(value))
    } catch {
      return json({ error: 'credentials_unavailable' }, { status: 500 })
    }
  }
  if (request.method === 'GET' && url.pathname === '/credentials/access-token') {
    try {
      const sealed = (await readValue(env, owner, 'credentials')) as string | null
      if (!sealed)
        return json(
          { error: 'not_connected', message: 'GitHub account is not connected' },
          { status: 401 }
        )
      const credentials = JSON.parse(sealed) as {
        accessToken: string
        refreshToken?: string
        expiresAt?: number
        user: { login: string; avatarUrl?: string }
      }
      const accessToken = await decryptSecret(env, credentials.accessToken)
      if (!credentials.expiresAt || credentials.expiresAt - Date.now() > 5 * 60 * 1000)
        return json({ accessToken, user: credentials.user })
      if (!credentials.refreshToken)
        return json(
          {
            error: 'github_authorization_failed',
            message: 'GitHub authorization expired; sign in again.'
          },
          { status: 401 }
        )
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: await decryptSecret(env, credentials.refreshToken)
        })
      })
      const grant = (await response.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        error?: string
      }
      if (!response.ok || !grant.access_token)
        return json(
          {
            error: 'github_authorization_failed',
            message: 'Could not refresh GitHub authorization'
          },
          { status: 401 }
        )
      const refreshed = {
        accessToken: await encryptSecret(env, grant.access_token),
        refreshToken: grant.refresh_token
          ? await encryptSecret(env, grant.refresh_token)
          : credentials.refreshToken,
        expiresAt: grant.expires_in ? Date.now() + grant.expires_in * 1000 : undefined,
        user: credentials.user
      }
      await writeValue(env, owner, 'credentials', JSON.stringify(refreshed))
      return json({ accessToken: grant.access_token, user: credentials.user })
    } catch {
      return json(
        { error: 'github_authorization_failed', message: 'Could not authorize GitHub request' },
        { status: 401 }
      )
    }
  }
  if (request.method === 'PUT' && url.pathname === '/credentials') {
    await writeValue(env, owner, 'credentials', JSON.stringify(await request.json()))
    return json({ ok: true })
  }
  if (request.method === 'GET' && url.pathname === '/workspaces') {
    const query = new URLSearchParams({
      owner_login: `eq.${owner}`,
      select:
        'workspace_id,repository,branch,github_status,server_revision,last_github_commit_at,github_message',
      order: 'created_at.asc'
    })
    const response = await supabaseRequest(env, `/rest/v1/pkms_workspaces?${query}`)
    const rows = (await response.json()) as Array<{
      workspace_id: string
      repository: string
      branch: string
      github_status: WorkspaceRecord['githubStatus']
      server_revision: number
      last_github_commit_at: string | null
      github_message: string | null
    }>
    return json({ workspaces: rows.map(workspaceRecord) })
  }
  if (request.method === 'PUT' && url.pathname === '/workspaces') {
    const workspace = (await request.json()) as WorkspaceRecord
    const response = await supabaseRequest(
      env,
      '/rest/v1/pkms_workspaces?on_conflict=workspace_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          workspace_id: workspace.id,
          owner_login: owner,
          repository: workspace.repository,
          branch: workspace.branch,
          github_status: workspace.githubStatus,
          server_revision: workspace.revision,
          github_message: workspace.message ?? null
        })
      }
    )
    const rows = (await response.json()) as Record<string, unknown>[]
    return json({ workspace: rows[0] ? workspaceRecord(rows[0] as never) : workspace })
  }
  if (request.method === 'PATCH' && url.pathname.startsWith('/workspaces/')) {
    const id = decodeURIComponent(url.pathname.slice('/workspaces/'.length))
    const patch = (await request.json()) as Partial<WorkspaceRecord>
    const values: Record<string, unknown> = {}
    if (patch.githubStatus) values.github_status = patch.githubStatus
    if (typeof patch.revision === 'number') values.server_revision = patch.revision
    if (patch.lastGitHubCommitAt) values.last_github_commit_at = patch.lastGitHubCommitAt
    if (patch.message !== undefined) values.github_message = patch.message
    const query = new URLSearchParams({ workspace_id: `eq.${id}`, owner_login: `eq.${owner}` })
    const response = await supabaseRequest(env, `/rest/v1/pkms_workspaces?${query}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(values)
    })
    const rows = (await response.json()) as Record<string, unknown>[]
    return rows[0]
      ? json({ workspace: workspaceRecord(rows[0] as never) })
      : json({ error: 'not_found' }, { status: 404 })
  }
  if (url.pathname.startsWith('/mcp-oauth/put/') && request.method === 'POST') {
    const key = decodeURIComponent(url.pathname.slice('/mcp-oauth/put/'.length))
    if (!key || key.includes('/')) return json({ error: 'invalid_key' }, { status: 400 })
    if (key.startsWith('client:')) {
      const query = new URLSearchParams({
        account_login: 'eq.__pkms_mcp_oauth__',
        value_key: 'like.mcp:client:%',
        select: 'value_key'
      })
      const response = await supabaseRequest(env, `/rest/v1/pkms_account_values?${query}`)
      if (((await response.json()) as unknown[]).length >= 20)
        return json({ error: 'client_limit_reached' }, { status: 429 })
    }
    const body = (await request.json()) as { value?: unknown; expiresAt?: number }
    if (typeof body.expiresAt !== 'number' || body.expiresAt <= Date.now())
      return json({ error: 'invalid_expiry' }, { status: 400 })
    await writeValue(env, '__pkms_mcp_oauth__', `mcp:${key}`, {
      value: body.value,
      expiresAt: body.expiresAt
    })
    return json({ ok: true })
  }
  if (
    ['GET', 'POST', 'DELETE'].includes(request.method) &&
    /\/mcp-oauth\/(?:get|consume|delete)\//.test(url.pathname)
  ) {
    const consume = url.pathname.includes('/consume/')
    const key = decodeURIComponent(
      url.pathname.replace(/^\/mcp-oauth\/(?:get|consume|delete)\//, '')
    )
    if (!key || key.includes('/')) return json({ error: 'invalid_key' }, { status: 400 })
    const stored = (await readValue(env, '__pkms_mcp_oauth__', `mcp:${key}`)) as {
      value?: unknown
      expiresAt?: number
    } | null
    if (consume || request.method === 'DELETE')
      await deleteValue(env, '__pkms_mcp_oauth__', `mcp:${key}`)
    if (!stored) return json({ error: 'not_found' }, { status: 404 })
    if (typeof stored.expiresAt !== 'number' || stored.expiresAt <= Date.now())
      return json({ error: 'expired' }, { status: 404 })
    return json(stored)
  }
  return json({ error: 'not_found' }, { status: 404 })
}

function workspaceRecord(row: {
  workspace_id: string
  repository: string
  branch: string
  github_status: WorkspaceRecord['githubStatus']
  server_revision: number
  last_github_commit_at?: string | null
  github_message?: string | null
}): WorkspaceRecord {
  return {
    id: row.workspace_id,
    repository: row.repository,
    branch: row.branch,
    githubStatus: row.github_status,
    revision: row.server_revision,
    ...(row.last_github_commit_at ? { lastGitHubCommitAt: row.last_github_commit_at } : {}),
    ...(row.github_message ? { message: row.github_message } : {})
  }
}
