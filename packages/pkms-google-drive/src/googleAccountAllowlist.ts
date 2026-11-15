export interface GoogleAccountProfile {
  email?: string
  email_verified?: boolean
}

export function parseGoogleAccountAllowlist(value?: string): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  ]
}

export async function requireAllowedGoogleAccount(
  accessToken: string,
  allowedEmails: readonly string[],
  fetcher: typeof fetch = globalThis.fetch
): Promise<string> {
  const allowed = new Set(allowedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))
  if (allowed.size === 0) throw new Error('Google Drive account allowlist is not configured.')

  const response = await fetcher('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!response.ok) throw new Error('Could not verify the Google account for this workspace.')
  const profile = (await response.json()) as GoogleAccountProfile
  const email = profile.email?.trim().toLowerCase()
  if (!email || profile.email_verified !== true)
    throw new Error('Google did not return a verified account email.')
  if (!allowed.has(email))
    throw new Error('This Google account is not allowed to use this workspace.')
  return email
}
