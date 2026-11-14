import type { Env, Session } from './env'
import { decryptSecret, encryptSecret, json, randomToken } from './crypto'
import { getAccountValue, putAccountValue, removeAccountValue } from './store'

type Provider = 'cloudflare' | 'supabase'
type SavedConnection = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  connectedAt: string
}
type SupplementStatus =
  'available' | 'not_configured' | 'permission_required' | 'provider_error' | 'inactive' | 'no_data'
type OAuthState = { provider: Provider; login: string; verifier: string; createdAt: number }
const redirectUri = (env: Env) => `${env.HOME_PUBLIC_ORIGIN}/api/services/oauth/callback`

function providerFromPath(path: string): Provider | null {
  return path.includes('cloudflare') ? 'cloudflare' : path.includes('supabase') ? 'supabase' : null
}

function clientId(env: Env, provider: Provider): string | undefined {
  return provider === 'cloudflare' ? env.CLOUDFLARE_OAUTH_CLIENT_ID : env.SUPABASE_OAUTH_CLIENT_ID
}

function clientSecret(env: Env, provider: Provider): string | undefined {
  return provider === 'cloudflare'
    ? env.CLOUDFLARE_OAUTH_CLIENT_SECRET
    : env.SUPABASE_OAUTH_CLIENT_SECRET
}

async function accessToken(env: Env, login: string, provider: Provider): Promise<string | null> {
  const key = `service:${provider}`
  const sealed = await getAccountValue(env, login, key)
  if (typeof sealed !== 'string') return null
  const saved = JSON.parse(await decryptSecret(env, sealed)) as SavedConnection
  if (!saved.expiresAt || saved.expiresAt > Date.now() + 60_000)
    return decryptSecret(env, saved.accessToken)
  if (!saved.refreshToken) return null
  const credentials = await tokenRequest(env, provider, {
    grant_type: 'refresh_token',
    refresh_token: await decryptSecret(env, saved.refreshToken)
  })
  if (!credentials.access_token) return null
  const refreshed: SavedConnection = {
    accessToken: await encryptSecret(env, credentials.access_token),
    ...(credentials.refresh_token
      ? { refreshToken: await encryptSecret(env, credentials.refresh_token) }
      : saved.refreshToken
        ? { refreshToken: saved.refreshToken }
        : {}),
    ...(credentials.expires_in ? { expiresAt: Date.now() + credentials.expires_in * 1000 } : {}),
    connectedAt: saved.connectedAt
  }
  await putAccountValue(env, login, key, await encryptSecret(env, JSON.stringify(refreshed)))
  return credentials.access_token
}

async function revokeConnection(env: Env, login: string, provider: Provider): Promise<void> {
  const key = `service:${provider}`
  try {
    const sealed = await getAccountValue(env, login, key)
    if (typeof sealed === 'string') {
      const saved = JSON.parse(await decryptSecret(env, sealed)) as SavedConnection
      const token = saved.refreshToken
        ? await decryptSecret(env, saved.refreshToken)
        : await decryptSecret(env, saved.accessToken)
      const id = clientId(env, provider)
      const secret = clientSecret(env, provider)
      const body = new URLSearchParams({
        token,
        token_type_hint: saved.refreshToken ? 'refresh_token' : 'access_token'
      })
      if (id) body.set('client_id', id)
      if (secret) body.set('client_secret', secret)
      const endpoint =
        provider === 'cloudflare'
          ? 'https://dash.cloudflare.com/oauth2/revoke'
          : 'https://api.supabase.com/v1/oauth/revoke'
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body
      })
    }
  } catch {
    /* local credential deletion still disconnects the account */
  }
  await removeAccountValue(env, login, key)
}

type TokenGrant = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}

async function tokenRequest(
  env: Env,
  provider: Provider,
  fields: Record<string, string>
): Promise<TokenGrant> {
  const id = clientId(env, provider)
  if (!id) throw new Error(`${provider}_oauth_not_configured`)
  const secret = clientSecret(env, provider)
  const endpoint =
    provider === 'cloudflare'
      ? 'https://dash.cloudflare.com/oauth2/token'
      : 'https://api.supabase.com/v1/oauth/token'
  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json'
  })
  const body = new URLSearchParams(fields)
  if (secret) headers.set('Authorization', `Basic ${btoa(`${id}:${secret}`)}`)
  else body.set('client_id', id)
  const response = await fetch(endpoint, { method: 'POST', headers, body })
  const result = (await response.json()) as TokenGrant
  if (!response.ok || !result.access_token) throw new Error(`${provider}_token_exchange_failed`)
  return result
}

function beginOAuth(env: Env, provider: Provider, login: string): Promise<Response> {
  return beginOAuthInner(env, provider, login)
}

async function beginOAuthInner(env: Env, provider: Provider, login: string): Promise<Response> {
  const id = clientId(env, provider)
  if (!id) return json({ error: 'oauth_not_configured', provider }, { status: 503 })
  const state = randomToken(32)
  const verifier = randomToken(48)
  const challenge = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    )
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  await putAccountValue(
    env,
    login,
    `service-oauth:${state}`,
    await encryptSecret(
      env,
      JSON.stringify({ provider, login, verifier, createdAt: Date.now() } satisfies OAuthState)
    )
  )
  const authorize = new URL(
    provider === 'cloudflare'
      ? 'https://dash.cloudflare.com/oauth2/auth'
      : 'https://api.supabase.com/v1/oauth/authorize'
  )
  authorize.searchParams.set('client_id', id)
  authorize.searchParams.set('redirect_uri', redirectUri(env))
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  if (provider === 'supabase') authorize.searchParams.set('scope', 'projects:read analytics:read')
  if (provider === 'cloudflare') {
    const scopes =
      env.CLOUDFLARE_OAUTH_SCOPES ??
      'account-analytics.read account-settings.read workers-scripts.metadata_read'
    authorize.searchParams.set('scope', scopes)
  }
  return json({ url: authorize.toString() })
}

export async function handleServiceOAuthCallback(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/services/oauth/callback') return null
  const state = url.searchParams.get('state') ?? ''
  // Provider is carried in the stored state, so find it using the supplied random state.
  let record: OAuthState | null = null
  const value = await getAccountValue(
    env,
    env.ALLOWED_GITHUB_LOGIN ?? 'lkh0310kr',
    `service-oauth:${state}`
  )
  try {
    if (typeof value === 'string')
      record = JSON.parse(await decryptSecret(env, value)) as OAuthState
  } catch {
    /* invalid state */
  }
  if (record) await removeAccountValue(env, record.login, `service-oauth:${state}`)
  if (
    !record ||
    record.login !== (env.ALLOWED_GITHUB_LOGIN ?? 'lkh0310kr') ||
    Date.now() - record.createdAt > 10 * 60_000
  )
    return callbackPage(false, '연결 요청이 만료되었거나 올바르지 않습니다.')
  if (url.searchParams.has('error'))
    return callbackPage(false, '공급자 로그인이 취소되었거나 거부되었습니다.')
  const code = url.searchParams.get('code')
  if (!code) return callbackPage(false, '인증 코드를 받지 못했습니다.')
  try {
    const grant = await tokenRequest(env, record.provider, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(env),
      code_verifier: record.verifier
    })
    const saved: SavedConnection = {
      accessToken: await encryptSecret(env, grant.access_token!),
      ...(grant.refresh_token
        ? { refreshToken: await encryptSecret(env, grant.refresh_token) }
        : {}),
      ...(grant.expires_in ? { expiresAt: Date.now() + grant.expires_in * 1000 } : {}),
      connectedAt: new Date().toISOString()
    }
    await putAccountValue(
      env,
      record.login,
      `service:${record.provider}`,
      await encryptSecret(env, JSON.stringify(saved))
    )
    return callbackPage(
      true,
      `${record.provider === 'cloudflare' ? 'Cloudflare' : 'Supabase'} 연결이 완료되었습니다. 앱으로 돌아가 상태를 새로고침하세요.`
    )
  } catch {
    return callbackPage(
      false,
      '공급자 연결을 완료하지 못했습니다. 설정과 권한을 확인한 뒤 다시 시도하세요.'
    )
  }
}

function callbackPage(ok: boolean, message: string): Response {
  const color = ok ? '#2f9b68' : '#c55b4a'
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>서비스 연결</title><main><h1>${ok ? '연결 완료' : '연결 실패'}</h1><p>${message}</p><small>이 창을 닫아도 안전합니다.</small></main><style>body{margin:0;background:#111;color:#eee;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{max-width:440px;padding:36px;border:1px solid #333;border-radius:16px}h1{color:${color}}p{line-height:1.6;color:#ccc}</style>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
      }
    }
  )
}

async function cloudflareSummary(token: string): Promise<unknown> {
  const accountsResponse = await fetch(
    'https://api.cloudflare.com/client/v4/accounts?per_page=50',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!accountsResponse.ok) throw new Error('cloudflare_accounts_failed')
  const accountsBody = (await accountsResponse.json()) as {
    result?: Array<{ id: string; name: string }>
  }
  const accounts = await Promise.all(
    (accountsBody.result ?? []).map(async (account) => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account.id)}/workers/scripts`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!response.ok)
        return { id: account.id, name: account.name, error: 'workers_unavailable', workers: [] }
      const body = (await response.json()) as {
        result?: Array<{
          id: string
          created_on?: string
          modified_on?: string
          usage_model?: string
        }>
      }
      const workers = (body.result ?? []).slice(0, 50).map((worker) => ({
        name: worker.id,
        lastModified: worker.modified_on ?? worker.created_on ?? null,
        usageModel: worker.usage_model ?? null,
        dashboardUrl: `https://dash.cloudflare.com/${encodeURIComponent(account.id)}/workers/services/view/${encodeURIComponent(worker.id)}/production`
      }))
      const end = new Date()
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60_000)
      const dayAgo = end.getTime() - 24 * 60 * 60_000
      const query = `query WorkerDaily($accountTag: string, $start: string, $dayAgo: string, $end: string) { viewer { accounts(filter: { accountTag: $accountTag }) { trend: workersInvocationsAdaptive(limit: 10000, orderBy: [datetime_DESC], filter: { datetime_geq: $start, datetime_leq: $end }) { sum { requests errors subrequests } quantiles { cpuTimeP99 } dimensions { datetime } } workerTotals: workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $dayAgo, datetime_leq: $end }) { sum { requests errors subrequests } quantiles { cpuTimeP99 } dimensions { scriptName } } } } }`
      const analyticsResponse = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: {
            accountTag: account.id,
            start: start.toISOString(),
            dayAgo: new Date(dayAgo).toISOString(),
            end: end.toISOString()
          }
        })
      })
      let analytics24h: {
        requests: number
        errors: number
        subrequests: number
        cpuTimeP99: number | null
      } | null = null
      let trend: Array<{
        timestamp: string
        requests: number
        errors: number
        subrequests: number
        cpuTimeP99: number | null
      }> = []
      let detailedWorkers = workers.map((worker) => ({
        ...worker,
        requests24h: null as number | null,
        errors24h: null as number | null,
        subrequests24h: null as number | null,
        cpuTimeP99: null as number | null
      }))
      if (analyticsResponse.ok) {
        const data = (await analyticsResponse.json()) as {
          errors?: Array<{ message?: string }> | null
          data?: {
            viewer?: {
              accounts?: Array<{
                trend?: Array<{
                  sum?: { requests?: number; errors?: number; subrequests?: number }
                  quantiles?: { cpuTimeP99?: number }
                  dimensions?: { datetime?: string }
                }>
                workerTotals?: Array<{
                  sum?: { requests?: number; errors?: number; subrequests?: number }
                  quantiles?: { cpuTimeP99?: number }
                  dimensions?: { scriptName?: string }
                }>
              }>
            }
          }
        }
        // GraphQL can return HTTP 200 alongside an errors array. Treat that as
        // unavailable data instead of turning a missing series into false zeroes.
        const accountAnalytics = data.data?.viewer?.accounts?.[0]
        const series = accountAnalytics?.trend
        const workerTotals = accountAnalytics?.workerTotals
        if (data.errors?.length || !Array.isArray(series) || !Array.isArray(workerTotals)) {
          return {
            id: account.id,
            name: account.name,
            dashboardUrl: `https://dash.cloudflare.com/${encodeURIComponent(account.id)}/workers-and-pages`,
            workers,
            analytics24h: null,
            analyticsStatus: 'provider_error',
            trend: []
          }
        }
        type AnalyticsPoint = {
          sum?: { requests?: number; errors?: number; subrequests?: number }
          quantiles?: { cpuTimeP99?: number }
          dimensions?: { datetime?: string }
        }
        const workerMetrics = new Map<
          string,
          {
            requests24h: number
            errors24h: number
            subrequests24h: number
            cpuTimeP99: number | null
          }
        >()
        for (const point of workerTotals) {
          if (point.dimensions?.scriptName)
            workerMetrics.set(point.dimensions.scriptName, {
              requests24h: point.sum?.requests ?? 0,
              errors24h: point.sum?.errors ?? 0,
              subrequests24h: point.sum?.subrequests ?? 0,
              cpuTimeP99: point.quantiles?.cpuTimeP99 ?? null
            })
        }
        detailedWorkers = workers.map((worker) => ({
          ...worker,
          ...(workerMetrics.get(worker.name) ?? {
            requests24h: 0,
            errors24h: 0,
            subrequests24h: 0,
            cpuTimeP99: null
          })
        }))
        const byQuarterHour = new Map<
          string,
          {
            timestamp: string
            requests: number
            errors: number
            subrequests: number
            cpuTimeP99: number | null
          }
        >()
        const recent = series.filter(
          (point: AnalyticsPoint) =>
            point.dimensions?.datetime && new Date(point.dimensions.datetime).getTime() >= dayAgo
        )
        analytics24h = recent.reduce(
          (
            total: {
              requests: number
              errors: number
              subrequests: number
              cpuTimeP99: number | null
            },
            point: AnalyticsPoint
          ) => ({
            requests: total.requests + (point.sum?.requests ?? 0),
            errors: total.errors + (point.sum?.errors ?? 0),
            subrequests: total.subrequests + (point.sum?.subrequests ?? 0),
            cpuTimeP99: Math.max(total.cpuTimeP99 ?? 0, point.quantiles?.cpuTimeP99 ?? 0) || null
          }),
          { requests: 0, errors: 0, subrequests: 0, cpuTimeP99: null }
        )
        for (const point of series as AnalyticsPoint[]) {
          if (!point.dimensions?.datetime) continue
          const date = new Date(point.dimensions.datetime)
          if (!Number.isFinite(date.getTime()) || date.getTime() < start.getTime()) continue
          date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 15) * 15, 0, 0)
          const timestamp = date.toISOString()
          const bucket = byQuarterHour.get(timestamp) ?? {
            timestamp,
            requests: 0,
            errors: 0,
            subrequests: 0,
            cpuTimeP99: null
          }
          bucket.requests += point.sum?.requests ?? 0
          bucket.errors += point.sum?.errors ?? 0
          bucket.subrequests += point.sum?.subrequests ?? 0
          bucket.cpuTimeP99 =
            Math.max(bucket.cpuTimeP99 ?? 0, point.quantiles?.cpuTimeP99 ?? 0) || null
          byQuarterHour.set(timestamp, bucket)
        }
        trend = [...byQuarterHour.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      }
      return {
        id: account.id,
        name: account.name,
        dashboardUrl: `https://dash.cloudflare.com/${encodeURIComponent(account.id)}/workers-and-pages`,
        workers: detailedWorkers,
        analytics24h,
        analyticsStatus: analytics24h ? 'available' : 'provider_error',
        trend
      }
    })
  )
  return { provider: 'cloudflare', connected: true, accounts }
}

async function supabaseSummary(token: string, metricsToken: string | null): Promise<unknown> {
  const response = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  })
  if (!response.ok) throw new Error('supabase_projects_failed')
  const projects = (await response.json()) as Array<{
    id: string
    name: string
    status?: string
    region?: string
    organization_id?: string
  }>
  const result = await Promise.all(
    projects.slice(0, 10).map(async (project) => {
      let databaseSizeMb: number | null = null
      let activeConnections: number | null = null
      let storageRequests: number | null = null
      let apiRequests: number | null = null
      let diskUsedBytes: number | null = null
      let diskSizeBytes: number | null = null
      let diskAvailableBytes: number | null = null
      let usageTrend: Array<{
        timestamp: string
        requests: number
        authRequests: number
        realtimeRequests: number
        restRequests: number
        storageRequests: number
      }> = []
      let metricsError: string | null = null
      let databaseMetricsStatus: SupplementStatus = 'provider_error'
      let usageStatus: SupplementStatus = metricsToken ? 'provider_error' : 'not_configured'
      let diskStatus: SupplementStatus = metricsToken ? 'provider_error' : 'not_configured'
      const active = project.status === 'ACTIVE_HEALTHY' || project.status === 'ACTIVE_UNHEALTHY'
      if (!active) {
        usageStatus = 'inactive'
        diskStatus = 'inactive'
        databaseMetricsStatus = 'inactive'
      }
      if (active) {
        try {
          const metricsResponse = await fetch(
            `https://api.supabase.com/v1/projects/${encodeURIComponent(project.id)}/analytics/endpoints/metrics`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'text/plain' } }
          )
          if (metricsResponse.ok) {
            const text = await metricsResponse.text()
            const lines = text.split('\n').filter((line) => line && !line.startsWith('#'))
            const sumMetric = (name: string): number | null => {
              const values = lines.flatMap((line) => {
                const match = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([-+0-9.eE]+)$`).exec(line)
                return match ? [Number(match[1])] : []
              })
              return values.length ? values.reduce((sum, value) => sum + value, 0) : null
            }
            databaseSizeMb = sumMetric('pg_database_size_mb')
            activeConnections = sumMetric('supavisor_connections_active')
            databaseMetricsStatus =
              databaseSizeMb === null && activeConnections === null ? 'no_data' : 'available'
          } else {
            databaseMetricsStatus =
              metricsResponse.status === 401 || metricsResponse.status === 403
                ? 'permission_required'
                : 'provider_error'
            metricsError = `metrics_http_${metricsResponse.status}`
          }
        } catch {
          metricsError = 'metrics_unavailable'
          databaseMetricsStatus = 'provider_error'
        }
      }
      if (metricsToken && active) {
        try {
          const usageResponse = await fetch(
            `https://api.supabase.com/v1/projects/${encodeURIComponent(project.id)}/analytics/endpoints/usage.api-counts?interval=15min`,
            { headers: { Authorization: `Bearer ${metricsToken}`, Accept: 'application/json' } }
          )
          if (usageResponse.ok) {
            const usage = (await usageResponse.json()) as {
              result?: Array<{
                timestamp?: string
                total_storage_requests?: number
                total_auth_requests?: number
                total_realtime_requests?: number
                total_rest_requests?: number
              }>
            }
            const rangeStart = Date.now() - 7 * 24 * 60 * 60_000
            const rows = (usage.result ?? [])
              .filter((row) => row.timestamp && new Date(row.timestamp).getTime() >= rangeStart)
              .map((row) => ({
                timestamp: row.timestamp!,
                authRequests: row.total_auth_requests ?? 0,
                realtimeRequests: row.total_realtime_requests ?? 0,
                restRequests: row.total_rest_requests ?? 0,
                storageRequests: row.total_storage_requests ?? 0,
                requests:
                  (row.total_auth_requests ?? 0) +
                  (row.total_realtime_requests ?? 0) +
                  (row.total_rest_requests ?? 0) +
                  (row.total_storage_requests ?? 0)
              }))
            if (rows.length) {
              usageTrend = rows
              const last24h = rows.filter(
                (row) => new Date(row.timestamp).getTime() >= Date.now() - 24 * 60 * 60_000
              )
              apiRequests = last24h.reduce((sum, row) => sum + row.requests, 0)
              storageRequests = last24h.reduce((sum, row) => sum + row.storageRequests, 0)
              usageStatus = 'available'
            } else usageStatus = 'no_data'
          } else
            usageStatus =
              usageResponse.status === 401 || usageResponse.status === 403
                ? 'permission_required'
                : 'provider_error'
        } catch {
          usageStatus = 'provider_error'
        }
        try {
          const diskResponse = await fetch(
            `https://api.supabase.com/v1/projects/${encodeURIComponent(project.id)}/config/disk/util`,
            { headers: { Authorization: `Bearer ${metricsToken}`, Accept: 'application/json' } }
          )
          if (diskResponse.ok) {
            const disk = (await diskResponse.json()) as {
              metrics?: { fs_size_bytes?: number; fs_avail_bytes?: number; fs_used_bytes?: number }
            }
            diskUsedBytes = disk.metrics?.fs_used_bytes ?? null
            diskSizeBytes = disk.metrics?.fs_size_bytes ?? null
            diskAvailableBytes = disk.metrics?.fs_avail_bytes ?? null
            diskStatus = diskUsedBytes === null ? 'no_data' : 'available'
          } else
            diskStatus =
              diskResponse.status === 401 || diskResponse.status === 403
                ? 'permission_required'
                : 'provider_error'
        } catch {
          diskStatus = 'provider_error'
        }
      }
      return {
        id: project.id,
        name: project.name,
        status: project.status ?? 'unknown',
        region: project.region ?? null,
        databaseSizeMb,
        activeConnections,
        storageRequests,
        apiRequests,
        usageTrend,
        diskUsedBytes,
        diskSizeBytes,
        diskAvailableBytes,
        usageStatus,
        diskStatus,
        databaseMetricsStatus,
        ...(metricsError ? { metricsError } : {})
      }
    })
  )
  return {
    provider: 'supabase',
    connected: true,
    supplementalTokenConfigured: metricsToken !== null,
    projects: result
  }
}

async function vercelSummary(token: string): Promise<unknown> {
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  const since = Date.now() - 24 * 60 * 60_000
  const [teamsResponse, personalProjectsResponse, personalDeploymentsResponse, userResponse] =
    await Promise.all([
      fetch('https://api.vercel.com/v2/teams?limit=100', { headers }),
      fetch('https://api.vercel.com/v9/projects?limit=100', { headers }),
      fetch('https://api.vercel.com/v6/deployments?limit=50&since=' + since, { headers }),
      fetch('https://api.vercel.com/v2/user', { headers })
    ])
  if (!personalProjectsResponse.ok && personalProjectsResponse.status !== 403)
    throw new Error('vercel_projects_failed')
  type Project = {
    id: string
    name: string
    framework?: string | null
    teamId?: string | null
    latestDeployment?: Record<string, unknown> | null
  }
  type Deployment = {
    id: string
    name?: string
    projectId?: string
    url?: string
    state?: string
    readyState?: string
    target?: string
    createdAt?: number
    ready?: number
  }
  const projects: Project[] = []
  const deployments: Deployment[] = []
  if (personalProjectsResponse.ok)
    projects.push(
      ...(((await personalProjectsResponse.json()) as { projects?: Project[] }).projects ?? [])
    )
  if (personalDeploymentsResponse.ok)
    deployments.push(
      ...(((await personalDeploymentsResponse.json()) as { deployments?: Deployment[] })
        .deployments ?? [])
    )
  let teams: Array<{ id: string; name: string; slug?: string }> = []
  if (teamsResponse.ok)
    teams = ((await teamsResponse.json()) as { teams?: typeof teams }).teams ?? []
  const currentUser = userResponse.ok
    ? ((await userResponse.json()) as { user?: { username?: string } })
    : null
  const personalSlug = currentUser?.user?.username
  const teamResults = await Promise.all(
    teams.map(async (team) => {
      const query = new URLSearchParams({ limit: '100', teamId: team.id })
      const deployQuery = new URLSearchParams({
        limit: '50',
        since: String(since),
        teamId: team.id
      })
      const [projectResponse, deploymentResponse] = await Promise.all([
        fetch('https://api.vercel.com/v9/projects?' + query, { headers }),
        fetch('https://api.vercel.com/v6/deployments?' + deployQuery, { headers })
      ])
      const teamProjects = projectResponse.ok
        ? (((await projectResponse.json()) as { projects?: Project[] }).projects ?? [])
        : []
      const teamDeployments = deploymentResponse.ok
        ? (((await deploymentResponse.json()) as { deployments?: Deployment[] }).deployments ?? [])
        : []
      return { team, teamProjects, teamDeployments }
    })
  )
  const teamSlugById = new Map<string, string>()
  for (const result of teamResults) {
    projects.push(
      ...result.teamProjects.map((project) => ({
        ...project,
        teamId: project.teamId ?? result.team.id
      }))
    )
    deployments.push(...result.teamDeployments)
    if (result.team.slug) teamSlugById.set(result.team.id, result.team.slug)
  }
  const uniqueProjects = [...new Map(projects.map((project) => [project.id, project])).values()]
  const uniqueDeployments = [
    ...new Map(deployments.map((deployment) => [deployment.id, deployment])).values()
  ].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  const last24h = uniqueDeployments.filter((deployment) => (deployment.createdAt ?? 0) >= since)
  const deploymentState = (deployment: Deployment) =>
    deployment.readyState ?? deployment.state ?? ''
  const latestByProject = new Map<string, Deployment>()
  for (const deployment of uniqueDeployments)
    if (deployment.projectId && !latestByProject.has(deployment.projectId))
      latestByProject.set(deployment.projectId, deployment)
  const deploymentHourly = Array.from({ length: 24 }, (_, index) => {
    const hour = new Date()
    hour.setMinutes(0, 0, 0)
    hour.setHours(hour.getHours() - (23 - index))
    const timestamp = hour.toISOString()
    const next = hour.getTime() + 60 * 60_000
    const inHour = last24h.filter(
      (deployment) =>
        (deployment.createdAt ?? 0) >= hour.getTime() && (deployment.createdAt ?? 0) < next
    )
    return {
      timestamp,
      total: inHour.length,
      failed: inHour.filter((deployment) =>
        ['ERROR', 'CANCELED'].includes(deploymentState(deployment).toUpperCase())
      ).length
    }
  })
  return {
    provider: 'vercel',
    connected: true,
    tokenConfigured: true,
    projects: uniqueProjects.map((project) => {
      const scope = project.teamId ? teamSlugById.get(project.teamId) : personalSlug
      return {
        ...project,
        dashboardUrl: scope
          ? `https://vercel.com/${encodeURIComponent(scope)}/${encodeURIComponent(project.name)}`
          : null,
        latestDeployment: latestByProject.get(project.id) ?? project.latestDeployment ?? null
      }
    }),
    deployments: uniqueDeployments.slice(0, 30),
    deployments24h: {
      total: last24h.length,
      ready: last24h.filter((deployment) => deploymentState(deployment).toUpperCase() === 'READY')
        .length,
      failed: last24h.filter((deployment) =>
        ['ERROR', 'CANCELED'].includes(deploymentState(deployment).toUpperCase())
      ).length
    },
    deploymentHourly
  }
}

type PublicPlatformIncident = {
  id: string
  name: string
  status: string
  impact: string
  updatedAt: string | null
  url: string
  update: string
  components: Array<{ name: string; status: string }>
}
type PublicPlatformStatus = {
  id: string
  name: string
  status: string
  description: string
  incidentCount: number
  incidents: PublicPlatformIncident[]
  maintenanceCount: number
  statusUrl: string
}

async function publicPlatformStatus(): Promise<PublicPlatformStatus[]> {
  const providers = [
    {
      id: 'cloudflare',
      name: 'Cloudflare',
      url: 'https://www.cloudflarestatus.com/api/v2/summary.json',
      statusUrl: 'https://www.cloudflarestatus.com/'
    },
    {
      id: 'supabase',
      name: 'Supabase',
      url: 'https://status.supabase.com/api/v2/summary.json',
      statusUrl: 'https://status.supabase.com/'
    },
    {
      id: 'vercel',
      name: 'Vercel',
      url: 'https://www.vercel-status.com/api/v2/summary.json',
      statusUrl: 'https://www.vercel-status.com/'
    }
  ]
  return Promise.all(
    providers.map(async (provider) => {
      try {
        const response = await fetch(provider.url, {
          headers: { Accept: 'application/json', 'User-Agent': 'WorkspaceHomeDashboard/1.0' }
        })
        if (!response.ok)
          return {
            id: provider.id,
            name: provider.name,
            status: 'unknown',
            description: 'HTTP ' + response.status,
            incidentCount: 0,
            incidents: [],
            maintenanceCount: 0,
            statusUrl: provider.statusUrl
          }
        type IncidentUpdate = {
          body?: string
          created_at?: string
          affected_components?: Array<{ name?: string; new_status?: string }>
        }
        type Incident = {
          id?: string
          name?: string
          status?: string
          impact?: string
          updated_at?: string
          shortlink?: string
          incident_updates?: IncidentUpdate[]
        }
        type Maintenance = {
          id?: string
          name?: string
          status?: string
          scheduled_for?: string
          scheduled_until?: string
        }
        const body = (await response.json()) as {
          status?: { indicator?: string; description?: string }
          incidents?: Incident[]
          scheduled_maintenances?: Maintenance[]
        }
        const incidents = (body.incidents ?? [])
          .filter((incident) => incident.status !== 'resolved')
          .slice(0, 5)
          .map((incident) => {
            const latest = [...(incident.incident_updates ?? [])].sort((a, b) =>
              (b.created_at ?? '').localeCompare(a.created_at ?? '')
            )[0]
            return {
              id: incident.id ?? incident.name ?? provider.id,
              name: incident.name ?? '제목 없는 사건',
              status: incident.status ?? 'unknown',
              impact: incident.impact ?? 'unknown',
              updatedAt: incident.updated_at ?? latest?.created_at ?? null,
              url: incident.shortlink ?? provider.statusUrl,
              update: latest?.body?.slice(0, 600) ?? '',
              components: (latest?.affected_components ?? []).map((component) => ({
                name: component.name ?? '',
                status: component.new_status ?? 'unknown'
              }))
            }
          })
        const inProgressMaintenance = new Set(
          (body.scheduled_maintenances ?? [])
            .filter((item) => item.status === 'in_progress')
            .map((item) => item.name)
            .filter(Boolean)
        )
        return {
          id: provider.id,
          name: provider.name,
          status: body.status?.indicator ?? 'unknown',
          description: body.status?.description ?? '상태 정보 없음',
          incidentCount: incidents.length,
          incidents,
          maintenanceCount: inProgressMaintenance.size,
          statusUrl: provider.statusUrl
        }
      } catch {
        return {
          id: provider.id,
          name: provider.name,
          status: 'unknown',
          description: '상태 API에 연결할 수 없음',
          incidentCount: 0,
          incidents: [],
          maintenanceCount: 0,
          statusUrl: provider.statusUrl
        }
      }
    })
  )
}

export async function handleServiceApi(
  request: Request,
  env: Env,
  session: Session
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/services/')) return null
  if (request.method === 'GET' && url.pathname === '/api/services/status') {
    const [services, vercel, platforms] = await Promise.all([
      Promise.all(
        (
          [
            ['cloudflare', cloudflareSummary],
            ['supabase', supabaseSummary]
          ] as const
        ).map(async ([provider, fetchSummary]) => {
          try {
            const token = await accessToken(env, session.login, provider)
            if (provider === 'supabase') {
              const sealedMetricsToken = await getAccountValue(
                env,
                session.login,
                'service:supabase:metrics-token'
              )
              const metricsToken =
                typeof sealedMetricsToken === 'string'
                  ? await decryptSecret(env, sealedMetricsToken)
                  : null
              if (!token)
                return {
                  provider,
                  connected: false,
                  supplementalTokenConfigured: metricsToken !== null
                }
              return await supabaseSummary(token, metricsToken)
            }
            if (!token) return { provider, connected: false }
            return await fetchSummary(token)
          } catch {
            return { provider, connected: true, error: 'metrics_unavailable' }
          }
        })
      ),
      (async () => {
        const sealedToken = await getAccountValue(env, session.login, 'service:vercel:token')
        if (typeof sealedToken !== 'string')
          return { provider: 'vercel', connected: false, tokenConfigured: false }
        try {
          return await vercelSummary(await decryptSecret(env, sealedToken))
        } catch {
          return {
            provider: 'vercel',
            connected: true,
            tokenConfigured: true,
            error: 'metrics_unavailable'
          }
        }
      })(),
      publicPlatformStatus()
    ])
    return json({ services: [...services, vercel], platforms, updatedAt: new Date().toISOString() })
  }
  if (url.pathname === '/api/services/vercel/token') {
    if (request.method === 'PUT') {
      let body: { token?: unknown }
      try {
        body = (await request.json()) as { token?: unknown }
      } catch {
        return json({ error: 'invalid_request' }, { status: 400 })
      }
      if (typeof body.token !== 'string' || !body.token.trim() || body.token.length > 8192)
        return json({ error: 'invalid_token' }, { status: 400 })
      await putAccountValue(
        env,
        session.login,
        'service:vercel:token',
        await encryptSecret(env, body.token.trim())
      )
      return json({ ok: true })
    }
    if (request.method === 'DELETE') {
      await removeAccountValue(env, session.login, 'service:vercel:token')
      return json({ ok: true })
    }
  }
  const provider = providerFromPath(url.pathname)
  if (!provider) return json({ error: 'not_found' }, { status: 404 })
  if (provider === 'supabase' && url.pathname === '/api/services/supabase/metrics-token') {
    if (request.method === 'PUT') {
      let body: { token?: unknown }
      try {
        body = (await request.json()) as { token?: unknown }
      } catch {
        return json({ error: 'invalid_request' }, { status: 400 })
      }
      if (typeof body.token !== 'string' || !body.token.trim() || body.token.length > 8192)
        return json({ error: 'invalid_token' }, { status: 400 })
      await putAccountValue(
        env,
        session.login,
        'service:supabase:metrics-token',
        await encryptSecret(env, body.token.trim())
      )
      return json({ ok: true })
    }
    if (request.method === 'DELETE') {
      await removeAccountValue(env, session.login, 'service:supabase:metrics-token')
      return json({ ok: true })
    }
  }
  if (request.method === 'POST' && url.pathname.endsWith('/connect'))
    return beginOAuth(env, provider, session.login)
  if (request.method === 'DELETE' && url.pathname.endsWith('/connect')) {
    await revokeConnection(env, session.login, provider)
    if (provider === 'supabase')
      await removeAccountValue(env, session.login, 'service:supabase:metrics-token')
    return json({ ok: true })
  }
  return json({ error: 'not_found' }, { status: 404 })
}
