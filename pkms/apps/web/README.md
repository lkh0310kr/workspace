# PKMS web and Cloudflare backend

The React Router app and API run in one Cloudflare Worker. Supabase Postgres stores encrypted GitHub credentials, workspace metadata, files, and Yjs updates; Supabase Realtime carries collaboration updates and presence. The Worker buffers edits and commits them to GitHub every 15 minutes. R2 holds attachments.

## Local setup

1. Install dependencies from the repository root with `npm install`.
2. Create a GitHub App configured for user authorization, enable expiring user access tokens, and grant repository Contents read/write permission. Set its callback URL to `http://localhost:5173/api/auth/github/callback`.
3. Copy `.dev.vars.example` to `.dev.vars`; fill in the app client ID/secret, a random session HMAC secret, and a base64-encoded 32-byte AES key. Generate the AES key with `openssl rand -base64 32`.
4. Create a Supabase project, link it with `supabase link`, and apply the schema with `supabase db push`.
5. Create the attachment bucket once with `npx wrangler r2 bucket create pkms-attachments`.
6. Set the Supabase URL, anon key, service role key, and ES256 Realtime signing key as Worker secrets.
7. Start with `npm run dev` from the repository root.

The current deployment uses `https://pkms-cloud.lkh0310kr.workers.dev` as `PUBLIC_ORIGIN`. Its `SESSION_SECRET` and `DATA_ENCRYPTION_KEY` are already configured. Configure the GitHub App callback URL as `https://pkms-cloud.lkh0310kr.workers.dev/api/auth/github/callback`, then add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` with `npx wrangler secret put NAME` to enable sign-in.

## Login diagnostics

Each request returns an `X-Request-ID`. Sign-in failures show this ID on the page and emit structured stage events without OAuth codes, tokens, cookies, or request query strings. Stored invocation logs are disabled. To follow only safe application events, run this from the web app directory:

```sh
npx wrangler tail pkms-cloud --format json | jq --unbuffered 'select((.logs // [] | length) > 0 or (.exceptions // [] | length) > 0) | del(.event)'
```

Match the log `requestId` to the ID shown in the browser. Filtering removes the request URL and headers from the tail output.

## Free-tier deployment

Supabase stores edits and schedules them for GitHub backup 15 minutes after the first pending change. A one-minute Worker Cron claims due workspaces and commits through GitHub's Git Data API. Supabase Realtime delivers Yjs updates and presence. External branch movement pauses automatic commits to protect GitHub changes.

Deploy with `npm run deploy` after authenticating Wrangler using `npx wrangler login`. Configure Supabase secrets and the R2 bucket binding in `wrangler.jsonc` first. The cutover deletes the old Durable Object namespaces; after deployment, sign in to GitHub again and reconnect the repositories you use. GitHub remains the source of note contents.

Pushes to `main` that change the web app, root npm manifests, or deployment workflow deploy automatically through GitHub Actions. Add a Cloudflare API token with Workers deployment permissions as the `CLOUDFLARE_API_TOKEN` repository secret in GitHub. Manual runs are available from Actions → Deploy web → Run workflow.

## Current scope

- GitHub App OAuth login and token refresh; no long-lived GitHub token is sent to browser storage.
- Workspace selection lists writable repositories.
- Markdown CRDT updates use Yjs/Yrs v1 encoding and are persisted before acknowledgements.
- Markdown documents are cached in IndexedDB and shared over a private Supabase Realtime channel.
- File create/move/delete operations and attachment uploads are persisted in Supabase and R2.
- GitHub REST Git Data API commits are batched, retried, and guarded against unexpected branch head changes.
- Binary uploads have a 50 MiB PKMS limit to keep GitHub blob requests within practical Worker payload limits.

## MCP for AI agents

The Worker exposes a Streamable HTTP MCP endpoint at `/mcp`. Add it to Codex and complete the browser authorization flow:

```sh
codex mcp add pkms --url https://pkms-cloud.lkh0310kr.workers.dev/mcp
codex mcp login pkms
codex mcp list
```

The OAuth authorization code flow requires PKCE S256 and explicitly shows the requested read/write scopes before redirecting to GitHub. Only the allowed GitHub account can authorize. MCP access tokens are PKMS-scoped signed sessions; GitHub access tokens remain encrypted in Supabase and are never returned by MCP. The Worker enforces the token scopes on all API routes.

Available tools list workspaces and directory entries, read one Markdown file on request, write one Markdown file through the existing Yjs collaboration API, and inspect GitHub backup status. Directory listing returns metadata only; file contents are returned only by `read_file`. MCP errors and invocation logs do not include document bodies, OAuth codes, tokens, or query strings. The consent page warns that content explicitly read by an AI agent may be sent to that agent's model provider.

## Configuration

| Name | Required | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | Yes | GitHub App OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Yes | Server-only OAuth exchange and token refresh |
| `SESSION_SECRET` | Yes | HMAC signing key for the HttpOnly session cookie |
| `DATA_ENCRYPTION_KEY` | Yes | Base64 32-byte key for encrypting OAuth tokens at rest |
| `PUBLIC_ORIGIN` | Yes | Public origin used in OAuth callback and origin checks |
| `SUPABASE_URL` | Secret | Supabase project URL |
| `SUPABASE_ANON_KEY` | Secret | Client key used to connect Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server-only database access |
| `PKMS_REALTIME_PRIVATE_KEY` | Secret | ES256 signer for scoped Realtime JWTs |
| `PKMS_REALTIME_KEY_ID` | Variable | Public JWKS key identifier |
| `ASSET_BUCKET` | Binding | R2 attachment bucket |
