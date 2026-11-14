export interface Env {
  HOME_DB: D1Database
  HOME_DATA_ENCRYPTION_KEY: string
  HOME_PUBLIC_ORIGIN: string
  PKMS_ISSUER: string
  PKMS_JWKS_URL: string
  PKMS_TOKEN_AUDIENCE?: string
  ALLOWED_GITHUB_LOGIN?: string
  CLOUDFLARE_OAUTH_CLIENT_ID?: string
  CLOUDFLARE_OAUTH_CLIENT_SECRET?: string
  CLOUDFLARE_OAUTH_SCOPES?: string
  SUPABASE_OAUTH_CLIENT_ID?: string
  SUPABASE_OAUTH_CLIENT_SECRET?: string
}

export interface Session {
  login: string
}
