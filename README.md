# Workspace

Workspace는 로컬 파일을 편집하고 터미널·브라우저·파일 뷰어를 함께 사용하는 데스크톱 앱입니다. Editor는 사용자가 연 로컬 폴더를 직접 읽고 저장합니다. Google Drive 동기화가 필요하면 Google Drive 데스크톱 앱에서 동기화 중인 폴더를 열어 사용합니다.

## 시작하기

저장소 root에서 `npm install` 후 `npm run dev`를 실행합니다. 데스크톱 앱은 `apps/desktop`에, 보조 API Worker는 `apps/server`에 있습니다. 서버는 `npm run workspace:server:typecheck`과 `npm run workspace:server:deploy`로 확인·배포합니다.

데스크톱 앱 빌드는 `apps/desktop`에서 `npm run build`를 실행한 뒤 필요한 플랫폼 빌드 명령을 사용합니다.

## 저장소 구조

```text
apps/desktop/      Electron 데스크톱 앱
apps/server/       Workspace 서비스 API Worker
packages/editor/   공유 Editor UI와 provider 계약
docs/              제품·아키텍처·개발 문서
archive/           현재 제품 범위에서 제외한 자료
```

상세 문서는 [문서 색인](./docs/README.md)에서 찾을 수 있습니다.
