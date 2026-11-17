# Workspace

Workspace는 사용자가 연 로컬 폴더의 파일을 편집하는 데스크톱 작업 공간입니다. Editor는 로컬 파일을 직접 읽고 저장하며, 동기화 앱이 관리하는 폴더도 일반 로컬 폴더로 다룹니다. 앱 안에 계정, 클라우드 파일 동기화, 공동 편집 기능은 두지 않습니다.

현재 제품은 Electron Desktop 앱과 상태 확인용 Server로 구성됩니다. Desktop의 주요 기능은 **Home, Editor, Terminal, Browser**이며, 각 기능의 UI와 도메인은 가능한 범위에서 `packages/`의 독립 패키지로 관리합니다. Server는 `GET /api/health`만 제공하며 Desktop 편집 기능의 실행 조건이 아닙니다.

## 시작하기

저장소 루트에서 `npm install`을 실행한 뒤 `npm run dev`로 Desktop 앱을 시작합니다. Desktop의 타입 검사는 `npm run check:app`, 전체 테스트는 `npm test --prefix apps/desktop`으로 실행합니다. Server는 `npm run server:typecheck`으로 검사하고 `npm run server:deploy`로 배포합니다.

## 저장소 구조

```text
apps/desktop/      Electron 앱과 운영체제별 Main/preload 어댑터
apps/server/       상태 확인용 Cloudflare Worker
packages/browser/  Browser 기능 패키지
packages/editor/   Editor UI, 로컬 provider 계약, 검색·파일 뷰어 공통 기능
packages/home/     Home 화면과 시스템 요약 UI
packages/terminal/ Terminal UI와 터미널 도메인
packages/ui/       기능 간 공유 UI primitive와 스타일
docs/              제품·아키텍처·개발 문서
archive/           현재 제품 범위에서 제외한 프로젝트와 자료
```

문서 시작점은 [docs/README.md](./docs/README.md)입니다. 패키지 경계와 기능 계약은 그곳에서 각 아키텍처 문서로 이동해 확인할 수 있습니다.
