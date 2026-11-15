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
    const oauth = new GoogleDriveWebOAuth('public.apps.googleusercontent.com', () => identity)

    const connected = oauth.connect()
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' })
    callback?.({ access_token: 'memory-only-token', expires_in: '3600' })
    await connected

    await expect(oauth.getAccessToken()).resolves.toBe('memory-only-token')
    expect(oauth.connected).toBe(true)
  })

  it('requires a new foreground user action when the token is unavailable or rejected', async () => {
    const oauth = new GoogleDriveWebOAuth('public.apps.googleusercontent.com', () => ({
      accounts: {
        oauth2: {
          initTokenClient: () => ({ requestAccessToken: () => {} })
        }
      }
    }))

    await expect(oauth.getAccessToken()).rejects.toBeInstanceOf(DriveAuthenticationRequiredError)
    await expect(oauth.getAccessToken({ forceRefresh: true })).rejects.toBeInstanceOf(
      DriveAuthenticationRequiredError
    )
  })

  it('surfaces provider errors and refuses malformed OAuth configuration', async () => {
    const oauth = new GoogleDriveWebOAuth('public.apps.googleusercontent.com', () => ({
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }) => ({
            requestAccessToken: () => callback({ error: 'access_denied' })
          })
        }
      }
    }))

    await expect(oauth.connect()).rejects.toThrow('access_denied')
    expect(() => new GoogleDriveWebOAuth('not-a-client-id', () => undefined)).toThrow(/client ID/)
    await expect(
      new GoogleDriveWebOAuth('public.apps.googleusercontent.com', () => undefined).connect()
    ).rejects.toThrow(/not loaded/)
  })
})
