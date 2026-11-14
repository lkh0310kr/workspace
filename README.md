# Workspace

**Code, Markdown, terminal, browser 작업을 위한 native desktop workspace**이며 Home service dashboard와 PKMS를 pane으로 제공한다.

## Run

```bash
npm install
npm run dev
```

저장소 root에서 `npm run dev`를 실행하면 Workspace desktop app이 시작된다. 앱 디렉터리에서 실행하려면 `cd apps/workspace-app && npm run dev`를 사용한다. PKMS Web과 Worker의 개발 명령은 아래와 같다.

PKMS browser app과 API server는 별도 app이다. `apps/pkms-web`은 UI와 same-origin API proxy를, `apps/pkms-server`는 PKMS 인증과 data API를 소유한다. Workspace Home API Worker는 `apps/workspace-server`에 있다. Root npm workspace를 한 번 설치한 뒤 저장소 root에서 `npm run pkms:web:dev`, `npm run pkms:web:deploy`, `npm run pkms:server:deploy`, `npm run workspace:server:deploy`를 사용할 수 있다.

Production build는 `apps/workspace-app`에서 `npm run build`를 실행한 뒤 플랫폼 target(`build:mac`, `build:win`, `build:linux`)을 실행한다.

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

| Layer    | Tech                     |
| -------- | ------------------------ |
| 영역 | 기술 |
| --- | --- |
| Shell | Electron + electron-vite |
| UI | React + flexlayout-react |
| Terminal | xterm.js + node-pty |
| Editor | CodeMirror 6 |
| Browser | Electron `<webview>` |

Reference implementation (not shipped): `ref-proj/orca/`.
