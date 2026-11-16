import type {
  PkmsAssetResponse,
  PkmsRequestBody,
  PkmsRequestOptions,
  PkmsResponse,
  PkmsUploadPart
} from '../../shared/pkmsClient'
import { clearPkmsSession, readPkmsSession, writePkmsSession } from './session'
import { appendStartupLog } from '../startupLog'

const DEFAULT_PKMS_ORIGIN = 'https://pkms-cloud.lkh0310kr.workers.dev'
const DEFAULT_WORKSPACE_HOME_ORIGIN = 'https://workspace-home.lkh0310kr.workers.dev'

function pkmsOrigin(): string {
  const configured = process.env.PKMS_API_ORIGIN?.replace(/\/$/, '')
  if (!configured) return DEFAULT_PKMS_ORIGIN
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('invalid_pkms_origin')
  }
  const allowed =
    url.origin === DEFAULT_PKMS_ORIGIN ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  if (!allowed || url.username || url.password || url.pathname !== '/')
    throw new Error('invalid_pkms_origin')
  return url.origin
}

function resolveApiPath(pathname: string): URL {
  const origin = pkmsOrigin()
  const url = new URL(pathname, origin)
  if (url.origin !== origin || !url.pathname.startsWith('/api/') || url.username || url.password) {
    throw new Error('invalid_pkms_path')
  }
  return url
}

function workspaceHomeOrigin(): string {
  const configured = process.env.WORKSPACE_HOME_API_ORIGIN?.replace(/\/$/, '')
  if (!configured) return DEFAULT_WORKSPACE_HOME_ORIGIN
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('invalid_workspace_home_origin')
  }
  const allowed =
    url.origin === DEFAULT_WORKSPACE_HOME_ORIGIN ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  if (!allowed || url.username || url.password || url.pathname !== '/')
    throw new Error('invalid_workspace_home_origin')
  return url.origin
}

function resolveWorkspaceHomePath(pathname: string): URL {
  const origin = workspaceHomeOrigin()
  const url = new URL(pathname, origin)
  if (
    url.origin !== origin ||
    !url.pathname.startsWith('/api/services/') ||
    url.username ||
    url.password
  )
    throw new Error('invalid_workspace_home_path')
  return url
}

function toFormData(body: PkmsRequestBody): BodyInit | undefined {
  if (body.kind === 'json') return body.value
  const form = new FormData()
  for (const part of body.parts as PkmsUploadPart[]) {
    if ('fileName' in part) {
      const bytes = part.bytes.buffer.slice(
        part.bytes.byteOffset,
        part.bytes.byteOffset + part.bytes.byteLength
      ) as ArrayBuffer
      form.append(part.name, new Blob([bytes], { type: part.contentType }), part.fileName)
    } else {
      form.append(part.name, part.value)
    }
  }
  return form
}

export async function requestPkmsApi<T = unknown>(
  pathName: string,
  options: PkmsRequestOptions
): Promise<PkmsResponse<T>> {
  const url = resolveApiPath(pathName)
  const headers = new Headers(options.headers)
  headers.delete('authorization')
  const session = readPkmsSession()
  if (
    session &&
    url.pathname !== '/api/auth/device/start' &&
    url.pathname !== '/api/auth/device/poll'
  ) {
    headers.set('Authorization', `Bearer ${session}`)
  }
  if (options.body?.kind === 'json' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? toFormData(options.body) : undefined,
      redirect: 'follow'
    })
  } catch (error) {
    const cause = error instanceof Error && 'cause' in error ? error.cause : undefined
    const detail = cause && typeof cause === 'object' ? (cause as Record<string, unknown>) : {}
    appendStartupLog('pkms_fetch_failed', {
      host: url.host,
      method: options.method,
      errorName: error instanceof Error ? error.name : 'unknown',
      causeCode: typeof detail.code === 'string' ? detail.code : null,
      causeName: typeof detail.name === 'string' ? detail.name : null,
      causeMessage: typeof detail.message === 'string' ? detail.message.slice(0, 240) : null
    })
    throw error
  }
  const requestId = response.headers.get('X-Request-ID') ?? undefined
  let body: unknown
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== 204 && contentType.includes('application/json')) {
    body = await response.json()
  }

  if (url.pathname === '/api/auth/device/poll' && response.ok && body && typeof body === 'object') {
    const result = body as Record<string, unknown>
    if (typeof result.token === 'string') {
      writePkmsSession(result.token)
      const { token: _token, ...safeResult } = result
      body = safeResult
    }
  }
  if (url.pathname === '/api/logout' && response.ok) clearPkmsSession()
  return { status: response.status, requestId, body: body as T }
}

export async function requestWorkspaceHomeApi<T = unknown>(
  pathName: string,
  options: PkmsRequestOptions
): Promise<PkmsResponse<T>> {
  const url = resolveWorkspaceHomePath(pathName)
  const scoped = await requestPkmsApi<{ token?: string }>('/api/home/access-token', {
    method: 'POST',
    body: { kind: 'json', value: '{}' }
  })
  if (scoped.status !== 200 || !scoped.body.token)
    return { status: scoped.status || 401, body: scoped.body as T, requestId: scoped.requestId }
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${scoped.body.token}`)
  if (options.body?.kind === 'json' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')
  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? toFormData(options.body) : undefined,
    redirect: 'follow'
  })
  const requestId = response.headers.get('X-Request-ID') ?? undefined
  const body =
    response.status !== 204 &&
    (response.headers.get('content-type') ?? '').includes('application/json')
      ? await response.json()
      : undefined
  return { status: response.status, requestId, body: body as T }
}

export async function fetchPkmsAsset(pathName: string): Promise<PkmsAssetResponse> {
  const url = resolveApiPath(pathName)
  if (!/^\/api\/workspaces\/[^/]+\/assets\/[^/]+$/.test(url.pathname)) {
    throw new Error('invalid_pkms_asset_path')
  }
  const headers = new Headers()
  const session = readPkmsSession()
  if (session) headers.set('Authorization', `Bearer ${session}`)
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`asset_request_failed:${response.status}`)
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream'
  }
}

export function parsePkmsVerificationUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  if (url.origin !== 'https://github.com' || url.pathname !== '/login/device') {
    throw new Error('invalid_verification_url')
  }
  return url.toString()
}

export function parseServiceOAuthUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  const allowed =
    (url.origin === 'https://dash.cloudflare.com' && url.pathname === '/oauth2/auth') ||
    (url.origin === 'https://api.supabase.com' && url.pathname === '/v1/oauth/authorize')
  if (!allowed || url.username || url.password || url.protocol !== 'https:')
    throw new Error('invalid_service_oauth_url')
  return url.toString()
}
