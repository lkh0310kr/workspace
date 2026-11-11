# PKMS Server

현재 앱의 경계·상태·계약은 [app scope 문서](./docs/README.md)를 기준으로 합니다.

This Cloudflare Worker is the shared PKMS backend for Web, Workspace Desktop, iOS, and MCP clients. It owns PKMS authentication, workspace/document APIs, Supabase persistence and Realtime token issuance, GitHub backup, and the MCP endpoint. It does not render the Web UI.

The Worker is deployed as `pkms-cloud` to preserve its existing secrets, R2 bucket, cron, and public API origin. The Web app has its own Worker and forwards same-origin browser API requests here. Desktop and other native clients can call the API origin directly.

## Development and deployment

Install the repository npm workspaces from the root. Copy `.dev.vars.example` to `.dev.vars` for local secrets, then run:

```sh
npm run pkms:server:typecheck
npm run pkms:server:deploy
```

The deployed API origin is `https://pkms-cloud.lkh0310kr.workers.dev`. Keep `PUBLIC_ORIGIN` set to that API origin; `PKMS_WEB_ORIGIN` is the browser app origin used for GitHub OAuth callbacks and legacy root redirects.

The existing GitHub App callback and browser session remain on `https://pkms-cloud.lkh0310kr.workers.dev/api/auth/github/callback`. The PKMS server handles OAuth and API requests at that origin, and forwards page requests to the separately deployed Web Worker through a service binding. This preserves the existing `__Host-pkms_session` cookie scope while separating UI source and deployment. Workspace Home tokens are issued here and limited to the `workspace-home` audience.

Supabase database schema and migrations live under `supabase/`. Apply them from this directory with `npx supabase db push` after linking the intended Supabase project.
