# Workspace

Native desktop workspace for **code, Markdown, terminal and browser work**, with a Home service dashboard and PKMS available as a pane.

## Run

```bash
npm install
cd apps/workspace-app
npm run dev
```

The PKMS browser app and API server are separate apps: `apps/pkms-web` owns the UI and same-origin API proxy; `apps/pkms-server` owns PKMS authentication and data APIs. Workspace Home has its own API Worker in `apps/workspace-server`. Install root npm workspaces once, then use `npm run pkms:web:dev`, `npm run pkms:web:deploy`, `npm run pkms:server:deploy`, or `npm run workspace:server:deploy` from the repository root.

Production builds: run `npm run build`, then the platform target (`build:mac`, `build:win` or `build:linux`) from `apps/workspace-app`.

## Layout

```
apps/pkms-web/          PKMS browser UI and same-origin API proxy
apps/pkms-server/       Shared PKMS API, auth, MCP and GitHub backup Worker
apps/workspace-app/     Electron workspace and Home dashboard
apps/workspace-server/  Home provider API Worker and D1 schema
apps/pkms-ios/          PKMS iOS client
packages/pkms-client/   Shared PKMS React client
packages/pkms-core/     PKMS Rust core, WASM and FFI
packages/pkms-protocol/ HTTP and realtime contracts
docs/                   Current architecture, guides and planning
archive/                Features and experiments outside current product scope
ref-proj/               Reference implementations; not shipped
```

## Stack

| Layer | Tech |
|---|---|
| Shell | Electron + electron-vite |
| UI | React + flexlayout-react |
| Terminal | xterm.js + node-pty |
| Editor | CodeMirror 6 |
| Browser | Electron `<webview>` |

Reference implementation (not shipped): `ref-proj/orca/`.
