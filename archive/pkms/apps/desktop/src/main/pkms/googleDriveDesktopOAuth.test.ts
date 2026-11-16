import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveDesktopOAuth,
  type GoogleDriveDesktopCredentialStore
} from './googleDriveDesktopOAuth'

const clientId = 'desktop-client.apps.googleusercontent.com'
const driveScope = 'https://www.googleapis.com/auth/drive.file'
const allowedEmails = ['lkh0310kr@gmail.com']
const allowedProfile = () =>
  new Response(JSON.stringify({ email: 'lkh0310kr@gmail.com', email_verified: true }), {
    status: 200
  })

function credentialStore(): GoogleDriveDesktopCredentialStore & {
  token: string | null
  clear: ReturnType<typeof vi.fn>
  writeRefreshToken: ReturnType<typeof vi.fn>
} {
  return {
    token: null,
    isAvailable: () => true,
    readRefreshToken() {
      return this.token
    },
    writeRefreshToken: vi.fn(function (this: { token: string | null }, token: string) {
      this.token = token
    }),
    clear: vi.fn(function (this: { token: string | null }) {
      this.token = null
    })
  }
}

async function respondToAuthorization(url: string, wrongStateFirst = false): Promise<void> {
  const authorization = new URL(url)
  const callback = new URL(authorization.searchParams.get('redirect_uri')!)
  const state = authorization.searchParams.get('state')!
  if (wrongStateFirst) {
    const invalid = new URL(callback)
    invalid.searchParams.set('state', 'wrong-state')
    invalid.searchParams.set('code', 'ignored')
    const rejected = await fetch(invalid)
    expect(rejected.status).toBe(400)
  }
  callback.searchParams.set('state', state)
  callback.searchParams.set('code', 'authorization-code')
  const accepted = await fetch(callback)
  expect(accepted.status).toBe(200)
}

describe('GoogleDriveDesktopOAuth', () => {
  it('uses a system-browser PKCE loopback flow and stores only the refresh token', async () => {
    const store = credentialStore()
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('/userinfo')) return allowedProfile()
      const body = new URLSearchParams(init?.body as URLSearchParams)
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('client_id')).toBe(clientId)
      expect(body.get('code')).toBe('authorization-code')
      expect(body.get('code_verifier')?.length).toBeGreaterThanOrEqual(43)
      expect(body.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
      return new Response(
        JSON.stringify({
          access_token: 'memory-access-token',
          refresh_token: 'secure-refresh-token',
          expires_in: 3600,
          scope: driveScope
        }),
        { status: 200 }
      )
    })
    const openExternal = vi.fn((url: string) => respondToAuthorization(url, true))
    const oauth = new GoogleDriveDesktopOAuth({
      clientId,
      allowedEmails,
      credentialStore: store,
      openExternal,
      fetch: fetcher,
      callbackTimeoutMs: 1000
    })

    await oauth.connect()

    const authorization = new URL(openExternal.mock.calls[0][0])
    expect(authorization.origin).toBe('https://accounts.google.com')
    expect(authorization.searchParams.get('scope')).toBe(`openid email ${driveScope}`)
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(authorization.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]+$/)
    await expect(oauth.getAccessToken()).resolves.toBe('memory-access-token')
    expect(store.token).toBe('secure-refresh-token')
    expect(store.writeRefreshToken).toHaveBeenCalledTimes(1)
  })

  it('includes the configured public desktop client secret in code exchange and refresh requests', async () => {
    const store = credentialStore()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'short-lived-access-token',
            refresh_token: 'secure-refresh-token',
            expires_in: 30,
            scope: driveScope
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(allowedProfile())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'refreshed-access-token', expires_in: 3600 }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(allowedProfile())
    const oauth = new GoogleDriveDesktopOAuth({
      clientId,
      clientSecret: 'desktop-public-secret',
      allowedEmails,
      credentialStore: store,
      openExternal: async (url) => respondToAuthorization(url),
      fetch: fetcher
    })

    await oauth.connect()
    await oauth.getAccessToken()

    expect(
      new URLSearchParams(fetcher.mock.calls[0][1]?.body as URLSearchParams).get('client_secret')
    ).toBe('desktop-public-secret')
    expect(
      new URLSearchParams(fetcher.mock.calls[2][1]?.body as URLSearchParams).get('client_secret')
    ).toBe('desktop-public-secret')
  })

  it('refreshes expiring access tokens through the desktop client without prompting', async () => {
    const store = credentialStore()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'short-lived-access-token',
            refresh_token: 'secure-refresh-token',
            expires_in: 30,
            scope: driveScope
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(allowedProfile())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'refreshed-access-token',
            expires_in: 3600
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(allowedProfile())
    const oauth = new GoogleDriveDesktopOAuth({
      clientId,
      allowedEmails,
      credentialStore: store,
      openExternal: async (url) => respondToAuthorization(url),
      fetch: fetcher
    })

    await oauth.connect()
    await expect(oauth.getAccessToken()).resolves.toBe('refreshed-access-token')
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(
      new URLSearchParams(fetcher.mock.calls[2][1]?.body as URLSearchParams).get('grant_type')
    ).toBe('refresh_token')
  })

  it('honors a Drive client forced refresh after an unauthorized API response', async () => {
    const store = credentialStore()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'first-access-token',
            refresh_token: 'secure-refresh-token',
            expires_in: 3600,
            scope: driveScope
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(allowedProfile())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'forced-refresh-token', expires_in: 3600 }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(allowedProfile())
    const oauth = new GoogleDriveDesktopOAuth({
      clientId,
      allowedEmails,
      credentialStore: store,
      openExternal: async (url) => respondToAuthorization(url),
      fetch: fetcher
    })

    await oauth.connect()
    await expect(oauth.getAccessToken()).resolves.toBe('first-access-token')
    await expect(oauth.getAccessToken({ forceRefresh: true })).resolves.toBe('forced-refresh-token')
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('requires a configured native client and encrypted credential storage', async () => {
    const store = credentialStore()
    const openExternal = vi.fn(async () => {})
    const missingClient = new GoogleDriveDesktopOAuth({
      credentialStore: store,
      openExternal
    })
    await expect(missingClient.connect()).rejects.toThrow(/Desktop app client ID/)
    expect(openExternal).not.toHaveBeenCalled()

    const unavailableStore = new GoogleDriveDesktopOAuth({
      clientId,
      allowedEmails,
      credentialStore: { ...store, isAvailable: () => false },
      openExternal
    })
    await expect(unavailableStore.connect()).rejects.toThrow(/Secure credential storage/)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('clears persisted native credentials when disconnected', async () => {
    const store = credentialStore()
    store.token = 'stored-refresh-token'
    const oauth = new GoogleDriveDesktopOAuth({
      clientId,
      credentialStore: store,
      openExternal: async () => {}
    })
    expect(oauth.credentialStored).toBe(true)
    oauth.disconnect()
    expect(oauth.credentialStored).toBe(false)
    expect(store.clear).toHaveBeenCalledOnce()
  })
})
