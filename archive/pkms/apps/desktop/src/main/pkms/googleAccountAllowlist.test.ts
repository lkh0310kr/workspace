import { describe, expect, it, vi } from 'vitest'
import {
  parseGoogleAccountAllowlist,
  requireAllowedGoogleAccount
} from '../../../../../packages/pkms-google-drive/src/googleAccountAllowlist'

describe('Google account allowlist', () => {
  it('normalizes comma-separated addresses and removes duplicates', () => {
    expect(
      parseGoogleAccountAllowlist(' LKH0310KR@gmail.com, other@example.com, lkh0310kr@gmail.com ')
    ).toEqual(['lkh0310kr@gmail.com', 'other@example.com'])
  })

  it('allows only verified accounts whose email is configured', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ email: 'Lkh0310kr@gmail.com', email_verified: true }), {
          status: 200
        })
    )

    await expect(
      requireAllowedGoogleAccount('token', ['lkh0310kr@gmail.com'], fetcher)
    ).resolves.toBe('lkh0310kr@gmail.com')
    expect(fetcher).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer token' }
    })
  })

  it('fails closed for missing allowlists and unlisted or unverified accounts', async () => {
    await expect(requireAllowedGoogleAccount('token', [], vi.fn())).rejects.toThrow(
      /not configured/
    )
    await expect(
      requireAllowedGoogleAccount(
        'token',
        ['lkh0310kr@gmail.com'],
        async () =>
          new Response(JSON.stringify({ email: 'other@example.com', email_verified: true }))
      )
    ).rejects.toThrow(/not allowed/)
    await expect(
      requireAllowedGoogleAccount(
        'token',
        ['lkh0310kr@gmail.com'],
        async () =>
          new Response(JSON.stringify({ email: 'lkh0310kr@gmail.com', email_verified: false }))
      )
    ).rejects.toThrow(/verified account email/)
  })
})
