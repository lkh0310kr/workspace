import type { Env, Session, WorkspaceRecord } from './env'
import { accountStore } from './SupabaseAccountStore'
import { json } from './crypto'
import { handleVaultRequest } from './SupabaseVault'
import { issueRealtimeToken } from './realtimeAuth'

function account(env: Env, login: string) {
  return accountStore(env, login)
}

async function credentials(
  env: Env,
  login: string
): Promise<{ accessToken: string; user: { login: string; avatarUrl?: string } }> {
  const response = await account(env, login).fetch('https://account/credentials/access-token')
  if (!response.ok)
    throw new Error(
      ((await response.json()) as { message?: string }).message ?? 'GitHub account is not connected'
    )
  return response.json() as Promise<{
    accessToken: string
    user: { login: string; avatarUrl?: string }
  }>
}

async function githubRequest(token: string, path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'PKMS-Cloud/1.0'
    }
  })
}

export async function handleWorkspaceApi(
  request: Request,
  env: Env,
  requestId: string,
  auth: Session,
  ctx?: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/realtime/config') {
    return json({
      url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      issuer: env.PUBLIC_ORIGIN.replace(/\/$/, '')
    })
  }
  if (request.method === 'GET' && url.pathname === '/api/realtime/token') {
    const issued = await issueRealtimeToken(env, auth)
    return json(issued, { headers: { 'Cache-Control': 'no-store' } })
  }
  const authCredentials = await credentials(env, auth.login)

  if (request.method === 'GET' && url.pathname === '/api/repositories') {
    const response = await githubRequest(
      authCredentials.accessToken,
      '/user/repos?per_page=100&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member'
    )
    if (!response.ok)
      return json({ error: 'github_repository_list_failed' }, { status: response.status })
    const repositories = (await response.json()) as Array<{
      full_name: string
      default_branch: string
      private: boolean
      description?: string | null
      permissions?: { push?: boolean }
    }>
    return json({
      repositories: repositories.map((repository) => ({
        fullName: repository.full_name,
        defaultBranch: repository.default_branch,
        private: repository.private,
        description: repository.description,
        canWrite: repository.permissions?.push ?? false
      }))
    })
  }
  if (url.pathname === '/api/workspaces' && request.method === 'GET') {
    const response = await account(env, auth.login).fetch('https://account/workspaces')
    if (!response.ok) return json({ error: 'workspace_list_failed' }, { status: response.status })
    const workspaces = (await response.json()) as { workspaces: WorkspaceRecord[] }
    return json(workspaces)
  }
  if (url.pathname === '/api/workspaces' && request.method === 'POST') {
    const body = (await request.json()) as { repository?: string; branch?: string }
    const repository = body.repository ?? ''
    const repositoryResponse = await githubRequest(
      authCredentials.accessToken,
      `/repos/${repository}`
    )
    if (!repositoryResponse.ok)
      return json({ error: 'repository_unavailable' }, { status: repositoryResponse.status })
    const repo = (await repositoryResponse.json()) as {
      full_name: string
      default_branch: string
      permissions?: { push?: boolean }
    }
    if (!repo.permissions?.push) return json({ error: 'repository_read_only' }, { status: 403 })
    const branch = body.branch || repo.default_branch
    const id = await makeWorkspaceId(auth.login, repo.full_name, branch)
    const record: WorkspaceRecord = {
      id,
      repository: repo.full_name,
      branch,
      githubStatus: 'pending',
      revision: 0
    }
    const initialized = await handleVaultRequest(
      env,
      auth.login,
      id,
      new Request('https://room/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: repo.full_name,
          branch,
          accountLogin: auth.login
        })
      })
    )
    if (!initialized.ok) return initialized
    const saved = await account(env, auth.login).fetch('https://account/workspaces')
    const savedList = (await saved.json()) as { workspaces: WorkspaceRecord[] }
    return json(
      { workspace: savedList.workspaces.find((item) => item.id === id) ?? record },
      { status: 201 }
    )
  }

  const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)(\/.*)?$/)
  if (!match) return json({ error: 'not_found' }, { status: 404 })
  const workspaceId = decodeURIComponent(match[1])
  const listResponse = await account(env, auth.login).fetch('https://account/workspaces')
  const workspaceList = (await listResponse.json()) as { workspaces: WorkspaceRecord[] }
  const workspace = workspaceList.workspaces.find((item) => item.id === workspaceId)
  if (!workspace) return json({ error: 'not_found' }, { status: 404 })
  const internalPath = match[2] || '/snapshot'
  const internalUrl = new URL(request.url)
  internalUrl.pathname = internalPath
  const forwarded = new Request(internalUrl, request)
  const response = await handleVaultRequest(env, auth.login, workspaceId, forwarded, requestId, ctx)
  if (!internalPath.startsWith('/stream') && response.ok) {
    const clone = response.clone()
    if (internalPath === '/snapshot') {
      const snapshot = (await clone.json()) as { revision?: number }
      if (typeof snapshot.revision === 'number') {
        await account(env, auth.login).fetch(
          `https://account/workspaces/${encodeURIComponent(workspaceId)}`,
          { method: 'PATCH', body: JSON.stringify({ revision: snapshot.revision }) }
        )
      }
    }
  }
  return response
}

async function makeWorkspaceId(login: string, repository: string, branch: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${login.toLowerCase()}\0${repository.toLowerCase()}\0${branch}`)
  )
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
