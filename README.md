# Workspace

**코드, Markdown, 터미널, 브라우저 작업을 위한 데스크톱 작업 공간**이다. Home 서비스 대시보드와 PKMS를 pane으로 제공한다.

## 실행

```bash
npm install
npm run dev
```

저장소 root에서 `npm run dev`를 실행하면 Workspace 데스크톱 앱이 시작된다. 앱 디렉터리에서 실행할 때는 `cd apps/workspace-app && npm run dev`를 사용한다. PKMS Web과 Worker의 개발 명령은 아래와 같다.

PKMS 브라우저 앱과 API 서버는 별도 앱이다. `apps/pkms-web`은 UI와 동일 출처 API 프록시를, `apps/pkms-server`는 PKMS 인증과 데이터 API를 담당한다. Workspace Home API Worker는 `apps/workspace-server`에 있다. Root npm workspace를 한 번 설치한 뒤 저장소 root에서 `npm run pkms:web:dev`, `npm run pkms:web:deploy`, `npm run pkms:server:deploy`, `npm run workspace:server:deploy`를 사용할 수 있다.

프로덕션 빌드는 `apps/workspace-app`에서 `npm run build`를 실행한 다음 플랫폼 target(`build:mac`, `build:win`, `build:linux`)을 실행한다.

## 디렉터리 구성

```
apps/pkms-web/          PKMS 브라우저 UI와 동일 출처 API 프록시
apps/pkms-server/       공용 PKMS API, 인증, MCP, GitHub 백업 Worker
apps/workspace-app/     Electron 작업 공간과 Home 대시보드
apps/workspace-server/  Home provider API Worker와 D1 스키마
apps/pkms-ios/          PKMS iOS 클라이언트
packages/pkms-client/   공용 PKMS React 클라이언트
packages/pkms-core/     PKMS Rust core, WASM, FFI
packages/pkms-protocol/ HTTP 및 실시간 계약
docs/                   현재 아키텍처, 가이드, 계획
archive/                현재 제품 범위에서 제외된 기능과 실험
ref-proj/               배포하지 않는 참조 구현
```

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Shell | Electron + electron-vite |
| UI | React + flexlayout-react |
| Terminal | xterm.js + node-pty |
| Editor | CodeMirror 6 |
| Browser | Electron `<webview>` |

참조 구현 (배포하지 않음): `ref-proj/orca/`.
