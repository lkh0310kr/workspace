import type { Env, Session } from './env'

type Claims = {
  iss?: string
  aud?: string | string[]
  sub?: string
  scope?: string
  exp?: number
  iat?: number
}
type JwkSet = { keys?: JsonWebKey[] }
let cachedKeys: { expiresAt: number; keys: JsonWebKey[] } | undefined

function decodePart<T>(part: string): T {
  const bytes = Uint8Array.from(
    atob(
      part
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(part.length / 4) * 4, '=')
    ),
    (c) => c.charCodeAt(0)
  )
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

async function jwks(env: Env): Promise<JsonWebKey[]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys
  const response = await fetch(env.PKMS_JWKS_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) throw new Error('pkms_jwks_unavailable')
  const body = (await response.json()) as JwkSet
  if (!body.keys?.length) throw new Error('pkms_jwks_empty')
  cachedKeys = { keys: body.keys, expiresAt: Date.now() + 5 * 60_000 }
  return body.keys
}

export async function authenticate(request: Request, env: Env): Promise<Session | null> {
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const header = decodePart<{ alg?: string; kid?: string }>(parts[0])
    const claims = decodePart<Claims>(parts[1])
    const now = Math.floor(Date.now() / 1000)
    if (
      header.alg !== 'ES256' ||
      !header.kid ||
      claims.iss !== env.PKMS_ISSUER ||
      !claims.sub ||
      !claims.exp ||
      !claims.iat ||
      claims.exp <= now ||
      claims.iat > now + 30 ||
      claims.exp - claims.iat > 300
    )
      return null
    const audience = env.PKMS_TOKEN_AUDIENCE ?? 'workspace-home'
    if (!(Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience))
      return null
    if (!claims.scope?.split(' ').includes('workspace-home')) return null
    if (
      env.ALLOWED_GITHUB_LOGIN &&
      claims.sub.toLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLowerCase()
    )
      return null
    const key = (await jwks(env)).find(
      (candidate) => (candidate as JsonWebKey & { kid?: string }).kid === header.kid
    )
    if (!key) return null
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const signature = Uint8Array.from(
      atob(
        parts[2]
          .replaceAll('-', '+')
          .replaceAll('_', '/')
          .padEnd(Math.ceil(parts[2].length / 4) * 4, '=')
      ),
      (c) => c.charCodeAt(0)
    )
    if (
      !(await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        signingInput
      ))
    )
      return null
    return { login: claims.sub }
  } catch {
    return null
  }
}
