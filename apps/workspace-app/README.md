# Workspace App

Workspace는 terminal, browser, editor, file 관리, Home service dashboard를 제공하는 Electron desktop app이다.

Home dashboard는 app 기능이다. Provider API는 [`apps/workspace-server`](../workspace-server/README.md)로 독립 배포한다. Electron Main은 PKMS에서 5분 유효한 Home-scoped token을 받아 Home 요청을 proxy하므로 bearer token과 PKMS session이 renderer storage에 들어가지 않는다.

## Architecture and specifications

Runtime, layout, interaction, IPC, persistence, browser, 로컬 editor 계약은 [앱 문서](../../docs/architecture/workspace/README.md)를 읽는다. 공유 UI 계약은 해당 package 문서에서 관리한다.

## Development

이 디렉터리에서 desktop app을 실행한다.

```sh
npm run dev
```

Home server origin 기본값은 `https://workspace-home.lkh0310kr.workers.dev`다. 로컬 Worker를 사용하려면 `WORKSPACE_HOME_API_ORIGIN=http://localhost:8787`을 설정한다. PKMS API origin은 `PKMS_API_ORIGIN`으로 바꿀 수 있다.

Cloudflare와 Supabase OAuth client secret을 Workspace Home Worker에 등록하고 두 provider callback URL을 `/api/services/oauth/callback`에 설정할 때까지 Home service 계정 연결은 사용할 수 없다. 기존에 연결했던 provider도 다시 승인해야 한다. Provider credential은 PKMS storage에서 의도적으로 복사하지 않는다.

## Build

저장소 root 또는 이 디렉터리에서 `npm run dev`로 개발 app을 실행한다.

```sh
npm run build:mac
npm run build:win
npm run build:linux
```

## Updates and releases

패키징된 macOS/Windows build는 실행 뒤 공개 `lkh0310kr/workspace` GitHub Releases feed를 확인하고 새 stable release를 background에서 다운로드한다. 준비되면 설치를 위해 재시작할지 사용자에게 확인한다. macOS에서는 **Workspace → Check for Updates…**로 직접 확인할 수 있다.

각 릴리스는 서명된 native build에서 만든다(macOS는 `npm run release:mac`, Windows는 `npm run release:win`). 생성된 installer와 update metadata를 GitHub Draft Release에 함께 올린다. [활성 플랫폼 릴리스 정책](../../docs/architecture/desktop-release.md)을 따른다. 현재 사용하지 않는 플랫폼 때문에 검증된 활성 플랫폼 릴리스를 막지 않는다. `package.json`의 앱 버전과 Git tag를 일치시킨다(electron-builder는 `v<version>`을 요구한다). macOS update에는 Developer ID 서명이 필요하며 공개 배포는 notarize해야 한다. Windows update는 NSIS installer target이 필요하다. 서로 다른 플랫폼 build의 update metadata를 섞지 않는다.
