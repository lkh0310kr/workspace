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

Run the development app from the repository root with `npm run dev`, or from this directory with `npm run dev`.

```sh
npm run build:mac
npm run build:win
npm run build:linux
```

## Updates and releases

Packaged macOS and Windows builds check the public `lkh0310kr/workspace` GitHub Releases feed after launch and download a newer stable release in the background. When it is ready, Workspace asks before restarting to install it. On macOS, use **Workspace → Check for Updates…** to check manually.

Create each release from a signed native build (`npm run release:mac` on macOS or `npm run release:win` on Windows), then upload that build's installer and generated update metadata to a GitHub Draft Release. Publish the release only after both platforms are ready. Keep the app version in `package.json` and the Git tag aligned (electron-builder expects `v<version>`). macOS updates require a Developer ID signed app; public distribution should also be notarized. Windows updates require the NSIS installer target. Never mix update metadata from different platform builds.
