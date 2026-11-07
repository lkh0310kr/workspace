# PKMS Web

This app owns the browser UI and React Router SSR. Its Worker proxies `/api/*`, `/.well-known/*`, `/mcp`, and `/oauth/*` to the independent PKMS API Worker at `pkms-cloud`. This keeps browser requests same-origin while the PKMS server owns authentication, storage, collaboration, MCP, and GitHub backup.

## Development

Install repository workspaces from the root, then run:

```sh
npm run pkms:web:dev
```

For local web development, `PKMS_SERVER_ORIGIN` in `wrangler.jsonc` can point to a local PKMS Worker. The Electron app talks directly to the PKMS API Worker.

## Deploy

```sh
npm run pkms:web:typecheck
npm run pkms:web:deploy
```

The Web Worker is deployed independently at `https://pkms-web.lkh0310kr.workers.dev`; direct visits redirect to the existing canonical origin, `https://pkms-cloud.lkh0310kr.workers.dev`, to preserve the registered GitHub OAuth callback and host-only session cookie. The PKMS API Worker forwards page requests to this Worker through a service binding, while API requests remain on the API Worker. A later public-domain migration can make the Web Worker origin canonical after OAuth callback and session migration are planned together.
