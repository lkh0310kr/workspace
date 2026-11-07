# Workspace App

Workspace is the Electron desktop app for terminal, browser, editor, files, and the Home service dashboard.

The Home dashboard is part of the app. Its provider API is deployed independently as [`apps/workspace-server`](../workspace-server/README.md). Electron Main obtains a five-minute Home-scoped token from PKMS and proxies Home requests, so the bearer token and PKMS session stay out of renderer storage.

## Development

Run the desktop app from this directory:

```sh
npm run dev
```

The Home server origin defaults to `https://workspace-home.lkh0310kr.workers.dev`. Set `WORKSPACE_HOME_API_ORIGIN=http://localhost:8787` for a local Worker. The PKMS API origin can be overridden with `PKMS_API_ORIGIN`.

Home service account linking remains unavailable until the Cloudflare and Supabase OAuth client secrets are registered on the Workspace Home Worker and both provider callback URLs point to its `/api/services/oauth/callback` endpoint. Previously linked providers must be authorized again; provider credentials are intentionally not copied out of PKMS storage.

## Build

```sh
npm run build:mac
npm run build:win
npm run build:linux
```
