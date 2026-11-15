import { describe, expect, it, vi } from 'vitest'
import {
  DriveAuthenticationRequiredError,
  GoogleDriveWebOAuth,
  type GoogleIdentityAccounts,
  type GoogleIdentityTokenResponse
} from '../../../../../packages/pkms-google-drive/src'

describe('GoogleDriveWebOAuth', () => {
  it('acquires a Drive token on connect and keeps it only in memory', async () => {
    let callback: ((response: GoogleIdentityTokenResponse) => void) | undefined
    const requestAccessToken = vi.fn()
    const identity: GoogleIdentityAccounts = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((options) => {
            callback = options.callback
            return { requestAccessToken }
          })
        }
      }
    }
    const oauth = new GoogleDriveWebOAuth('public.apps.googleusercontent.com', () => identity, {
      allowedEmails: ['lkh0310kr@gmail.com'],
      fetch: async () =>
        new Response(JSON.stringify({ email: 'lkh0310kr@gmail.com', email_verified: true }), {
          status: 200
        })
    })

    const connected = oauth.connect()
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' })
    callback?.({ access_token: 'memory-only-token', expires_in: '3600' })
    await connected

    await expect(oauth.getAccessToken()).resolves.toBe('memory-only-token')
    expect(oauth.connected).toBe(true)
  })

  it('rejects a Google account outside the configured allowlist', async () => {
    let callback: ((response: GoogleIdentityTokenResponse) => void) | undefined
    const identity: GoogleIdentityAccounts = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((options) => {
            callback = options.callback
            return { requestAccessToken: vi.fn() }
          })
        }
      }
    }
    const oauth = new GoogleDriveWebOAuth('public.apps.googleusercontent.com', () => identity, {
      allowedEmails: ['lkh0310kr@gmail.com'],
      fetch: async () =>
        new Response(JSON.stringify({ email: 'other@gmail.com', email_verified: true }), {
          status: 200
        })
    })

    const connecting = oauth.connect()
    callback?.({ access_token: 'other-account-token', expires_in: '3600' })
    await expect(connecting).rejects.toThrow(/not allowed/)
    await expect(oauth.getAccessToken()).rejects.toBeInstanceOf(DriveAuthenticationRequiredError)
  })

  it('requires a new foreground user action when the token is unavailable or rejected', async () => {
    const oauth = new GoogleDriveWebOAuth(
      'public.apps.googleusercontent.com',
      () => ({
        accounts: {
          oauth2: {
            initTokenClient: () => ({ requestAccessToken: () => {} })
          }
        }
      }),
      { allowedEmails: ['lkh0310kr@gmail.com'] }
    )

    await expect(oauth.getAccessToken()).rejects.toBeInstanceOf(DriveAuthenticationRequiredError)
    await expect(oauth.getAccessToken({ forceRefresh: true })).rejects.toBeInstanceOf(
      DriveAuthenticationRequiredError
    )
  })

  it('surfaces provider errors and refuses malformed OAuth configuration', async () => {
    const oauth = new GoogleDriveWebOAuth(
      'public.apps.googleusercontent.com',
      () => ({
        accounts: {
          oauth2: {
            initTokenClient: ({ callback }) => ({
              requestAccessToken: () => callback({ error: 'access_denied' })
            })
          }
        }
      }),
      { allowedEmails: ['lkh0310kr@gmail.com'] }
    )

    await expect(oauth.connect()).rejects.toThrow('access_denied')
    expect(() => new GoogleDriveWebOAuth('not-a-client-id', () => undefined)).toThrow(/client ID/)
    await expect(
      new GoogleDriveWebOAuth(
        'public.apps.googleusercontent.com',
        () => undefined,
        { allowedEmails: ['lkh0310kr@gmail.com'] }
      ).connect()
    ).rejects.toThrow(/not loaded/)
  })
})
