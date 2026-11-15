import { createServer, type Server } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_MIN_VALIDITY_MS = 60_000
const CALLBACK_TIMEOUT_MS = 5 * 60_000

export interface GoogleDriveDesktopCredentialStore {
  isAvailable(): boolean
  readRefreshToken(): string | null
  writeRefreshToken(token: string): void
  clear(): void
}

export interface GoogleDriveDesktopOAuthOptions {
  clientId?: string
  credentialStore: GoogleDriveDesktopCredentialStore
  openExternal(url: string): Promise<void>
  fetch?: typeof fetch
  callbackTimeoutMs?: number
}

interface OAuthTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}

function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

function makeCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

function formBody(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values)
}

function tokenLifetime(response: OAuthTokenResponse): number {
  const seconds = Number(response.expires_in)
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error('Google returned an invalid access-token lifetime.')
  return seconds * 1000
}

function validateTokenResponse(response: OAuthTokenResponse, requireScope = true): string {
  if (response.error || !response.access_token)
    throw new Error(
      response.error_description ?? response.error ?? 'Google returned no access token.'
    )
  const grantedScopes = new Set((response.scope ?? '').split(/\s+/).filter(Boolean))
  if ((requireScope || response.scope) && !grantedScopes.has(DRIVE_FILE_SCOPE))
    throw new Error('Google did not grant the Google Drive file access scope.')
  tokenLifetime(response)
  return response.access_token
}

/** Main-process OAuth for Electron Desktop apps. Tokens never cross the IPC boundary. */
export class GoogleDriveDesktopOAuth {
  private readonly fetcher: typeof fetch
  private refreshToken: string | null = null
  private accessToken?: { value: string; expiresAt: number }
  private refreshing?: Promise<string>
  private connecting?: Promise<void>

  constructor(private readonly options: GoogleDriveDesktopOAuthOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch
  }

  get credentialStored(): boolean {
    return Boolean(this.refreshToken ?? this.options.credentialStore.readRefreshToken())
  }

  async connect(): Promise<void> {
    if (this.connecting) return this.connecting
    this.connecting = this.authorize().finally(() => {
      this.connecting = undefined
    })
    return this.connecting
  }

  async getAccessToken(options?: { forceRefresh?: boolean }): Promise<string> {
    if (options?.forceRefresh) this.accessToken = undefined
    if (this.accessToken && this.accessToken.expiresAt - Date.now() > TOKEN_MIN_VALIDITY_MS)
      return this.accessToken.value
    if (this.refreshing) return this.refreshing
    this.refreshing = this.refreshAccessToken().finally(() => {
      this.refreshing = undefined
    })
    return this.refreshing
  }

  disconnect(): void {
    this.accessToken = undefined
    this.refreshToken = null
    this.options.credentialStore.clear()
  }

  private async authorize(): Promise<void> {
    const clientId = this.requireClientId()
    this.assertCredentialStorage()
    const oldRefreshToken = this.refreshToken ?? this.options.credentialStore.readRefreshToken()
    const state = randomUrlSafe()
    const verifier = randomUrlSafe(64)
    const callback = await this.startLoopbackCallback(state)
    const authorization = new URL(AUTHORIZATION_ENDPOINT)
    authorization.search = formBody({
      client_id: clientId,
      redirect_uri: callback.redirectUri,
      response_type: 'code',
      scope: DRIVE_FILE_SCOPE,
      state,
      code_challenge: makeCodeChallenge(verifier),
      code_challenge_method: 'S256',
      access_type: 'offline',
      ...(oldRefreshToken ? {} : { prompt: 'consent' })
    }).toString()

    try {
      await this.options.openExternal(authorization.toString())
      const code = await callback.code
      const response = await this.fetcher(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody({
          client_id: clientId,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: callback.redirectUri
        })
      })
      const token = (await response.json()) as OAuthTokenResponse
      if (!response.ok) throw this.tokenError(token, 'Google authorization-code exchange failed.')
      const accessToken = validateTokenResponse(token)
      const refreshToken = token.refresh_token ?? oldRefreshToken
      if (!refreshToken)
        throw new Error(
          'Google did not return a refresh token. Revoke the app grant and connect again.'
        )
      this.options.credentialStore.writeRefreshToken(refreshToken)
      this.refreshToken = refreshToken
      this.accessToken = { value: accessToken, expiresAt: Date.now() + tokenLifetime(token) }
    } finally {
      callback.close()
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = this.refreshToken ?? this.options.credentialStore.readRefreshToken()
    if (!refreshToken) throw new Error('Google Drive connection requires sign-in.')
    const response = await this.fetcher(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody({
        client_id: this.requireClientId(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })
    const token = (await response.json()) as OAuthTokenResponse
    if (!response.ok) {
      if (token.error === 'invalid_grant') this.disconnect()
      throw this.tokenError(token, 'Google Drive token refresh failed.')
    }
    const accessToken = validateTokenResponse(token, false)
    this.refreshToken = token.refresh_token ?? refreshToken
    if (token.refresh_token) this.options.credentialStore.writeRefreshToken(token.refresh_token)
    this.accessToken = { value: accessToken, expiresAt: Date.now() + tokenLifetime(token) }
    return accessToken
  }

  private startLoopbackCallback(state: string): Promise<{
    redirectUri: string
    code: Promise<string>
    close(): void
  }> {
    let resolveCode!: (value: string) => void
    let rejectCode!: (cause: Error) => void
    const code = new Promise<string>((resolve, reject) => {
      resolveCode = resolve
      rejectCode = reject
    })
    let callbackReceived = false
    const server: Server = createServer((request, response) => {
      const callback = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method !== 'GET' || callback.pathname !== '/') {
        response.writeHead(404).end('Not found.')
        return
      }
      if (callback.searchParams.get('state') !== state) {
        response.writeHead(400).end('OAuth state did not match. Return to the app and retry.')
        return
      }
      if (callbackReceived) {
        response.writeHead(409).end('This OAuth response was already received.')
        return
      }
      callbackReceived = true
      const error = callback.searchParams.get('error')
      const authorizationCode = callback.searchParams.get('code')
      if (error) {
        response
          .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          .end(
            '<!doctype html><title>Google Drive</title><p>Sign-in was cancelled. Return to the app.</p>'
          )
        rejectCode(new Error(`Google authorization failed: ${error}`))
        return
      }
      if (!authorizationCode) {
        response.writeHead(400).end('Google returned no authorization code.')
        rejectCode(new Error('Google returned no authorization code.'))
        return
      }
      response
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(
          '<!doctype html><title>Google Drive</title><p>Google Drive is connected. Return to the app.</p>'
        )
      resolveCode(authorizationCode)
    })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        rejectCode(new Error('Google sign-in timed out. Return to the app and try again.'))
      }, this.options.callbackTimeoutMs ?? CALLBACK_TIMEOUT_MS)
      const close = () => {
        clearTimeout(timer)
        if (server.listening) server.close()
      }
      server.once('error', (cause) => {
        close()
        reject(cause)
      })
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          close()
          reject(new Error('Could not open a local Google sign-in callback.'))
          return
        }
        resolve({
          redirectUri: `http://127.0.0.1:${address.port}/`,
          code,
          close
        })
      })
    })
  }

  private requireClientId(): string {
    const clientId = this.options.clientId?.trim()
    if (!clientId?.endsWith('.apps.googleusercontent.com'))
      throw new Error(
        'Set the Google OAuth Desktop app client ID before connecting PKMS Google Drive.'
      )
    return clientId
  }

  private assertCredentialStorage(): void {
    if (!this.options.credentialStore.isAvailable())
      throw new Error(
        'Secure credential storage is unavailable. Google Drive sign-in was not started.'
      )
  }

  private tokenError(response: OAuthTokenResponse, fallback: string): Error {
    return new Error(response.error_description ?? response.error ?? fallback)
  }
}
