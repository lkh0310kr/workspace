import {
  DriveAuthenticationRequiredError,
  type DriveAccessTokenProvider
} from './googleDriveClient'
import { requireAllowedGoogleAccount } from './googleAccountAllowlist'

const DRIVE_FILE_SCOPE = 'openid email https://www.googleapis.com/auth/drive.file'
const MIN_VALIDITY_MS = 30_000

export interface GoogleIdentityTokenResponse {
  access_token?: string
  expires_in?: string | number
  scope?: string
  error?: string
  error_description?: string
}

export interface GoogleIdentityTokenClient {
  requestAccessToken(options?: { prompt?: string }): void
}

export interface GoogleIdentityAccounts {
  accounts: {
    oauth2: {
      initTokenClient(options: {
        client_id: string
        scope: string
        callback: (response: GoogleIdentityTokenResponse) => void
        error_callback?: (error: { message?: string; type?: string }) => void
      }): GoogleIdentityTokenClient
    }
  }
}

export type GoogleIdentityProvider = () => GoogleIdentityAccounts | undefined

/** Foreground-only GIS token provider. Access tokens are memory-only and never refreshed in the background. */
export class GoogleDriveWebOAuth implements DriveAccessTokenProvider {
  private token?: { accessToken: string; expiresAt: number }
  private connection?: Promise<void>

  constructor(
    private readonly clientId: string,
    private readonly identity: GoogleIdentityProvider = () =>
      (window as Window & { google?: GoogleIdentityAccounts }).google,
    private readonly options: { allowedEmails: readonly string[]; fetch?: typeof fetch } = {
      allowedEmails: []
    }
  ) {
    if (!clientId.endsWith('.apps.googleusercontent.com'))
      throw new Error('A Google OAuth Web client ID is required.')
  }

  /** Call from an explicit user gesture. */
  connect(): Promise<void> {
    if (this.connection) return this.connection
    if (this.options.allowedEmails.length === 0)
      return Promise.reject(new Error('Google Drive account allowlist is not configured.'))
    const identity = this.identity()
    if (!identity?.accounts?.oauth2)
      return Promise.reject(new Error('Google Identity Services is not loaded.'))

    this.connection = new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (cause?: Error) => {
        if (settled) return
        settled = true
        this.connection = undefined
        if (cause) reject(cause)
        else resolve()
      }
      const client = identity.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            finish(
              new Error(
                response.error_description ??
                  response.error ??
                  'Google did not issue a Drive access token.'
              )
            )
            return
          }
          const lifetimeSeconds = Number(response.expires_in)
          if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0) {
            finish(new Error('Google returned an invalid access-token lifetime.'))
            return
          }
          void requireAllowedGoogleAccount(
            response.access_token,
            this.options.allowedEmails,
            this.options.fetch
          ).then(
            () => {
              this.token = {
                accessToken: response.access_token!,
                expiresAt: Date.now() + lifetimeSeconds * 1000
              }
              finish()
            },
            (cause) =>
              finish(cause instanceof Error ? cause : new Error('Google account is not allowed.'))
          )
        },
        error_callback: (error) =>
          finish(new Error(error.message ?? error.type ?? 'Google OAuth popup failed.'))
      })
      try {
        client.requestAccessToken({ prompt: '' })
      } catch (cause) {
        finish(cause instanceof Error ? cause : new Error('Google OAuth popup failed.'))
      }
    })
    return this.connection
  }

  async getAccessToken(options?: { forceRefresh?: boolean }): Promise<string> {
    if (options?.forceRefresh) throw new DriveAuthenticationRequiredError()
    if (!this.token || this.token.expiresAt - Date.now() <= MIN_VALIDITY_MS)
      throw new DriveAuthenticationRequiredError()
    return this.token.accessToken
  }

  disconnect(): void {
    this.token = undefined
  }

  get connected(): boolean {
    return Boolean(this.token && this.token.expiresAt - Date.now() > MIN_VALIDITY_MS)
  }
}
