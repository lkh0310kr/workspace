# Workspace Home Worker

현재 앱의 경계·상태·계약은 [app scope 문서](./docs/README.md)를 기준으로 합니다.

This Cloudflare Worker serves the Workspace Home service dashboard API. It owns Cloudflare/Supabase OAuth credentials, the optional Supabase metrics token, and the Vercel read-only token. These values are encrypted with `HOME_DATA_ENCRYPTION_KEY` and stored in this Worker’s D1 database.

PKMS remains the identity authority. The Electron main process requests a five-minute `workspace-home` audience token from PKMS and forwards it to this Worker. This Worker validates the signature against PKMS JWKS, issuer, audience, expiry, and scope. It does not use PKMS’s session secret or database.

## Deploy

From the repository root, install dependencies and apply the D1 schema before deploying:

```sh
npm install
cd apps/workspace-server
npx wrangler d1 migrations apply workspace-home --remote
npx wrangler secret put HOME_DATA_ENCRYPTION_KEY
npx wrangler deploy
```

Set these Worker secrets before enabling provider connections:

- `HOME_DATA_ENCRYPTION_KEY`: base64-encoded random 32-byte key.
- `CLOUDFLARE_OAUTH_CLIENT_ID` and `CLOUDFLARE_OAUTH_CLIENT_SECRET`.
- `SUPABASE_OAUTH_CLIENT_ID` and `SUPABASE_OAUTH_CLIENT_SECRET`.

Configure both OAuth applications to use `https://workspace-home.lkh0310kr.workers.dev/api/services/oauth/callback`. Existing provider grants are not copied from PKMS storage; reconnect each provider after cutover. Vercel and Supabase metrics tokens can be re-entered from Home.

The PKMS Worker must expose `/api/home/access-token` and the JWKS endpoint configured in `wrangler.jsonc`. The Electron app can override the API origin with `WORKSPACE_HOME_API_ORIGIN` for local development; production defaults to the deployed Worker URL.

## Local development

Use `npx wrangler dev`. Put Worker-only values in `.dev.vars` (ignored by Git). The local D1 database uses the same migration files; use `npx wrangler d1 migrations apply workspace-home --local` before testing local requests.
