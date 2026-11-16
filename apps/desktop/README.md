# Workspace Desktop

Workspace Desktop은 터미널·브라우저·파일 탐색·Editor·파일 뷰어를 제공하는 Electron 앱이다. Editor는 선택한 로컬 폴더에서 직접 파일을 읽고 저장한다. Google Drive 동기화 폴더도 별도 연결 없이 일반 로컬 폴더로 연다.

## 아키텍처와 개발

Runtime, layout, interaction, IPC, persistence, browser, 로컬 Editor 계약은 [Desktop 문서](../../docs/architecture/workspace/README.md)를 참고한다. 공유 편집기 UI 계약은 [`packages/editor`](../../packages/editor/README.md)가 소유한다.

```sh
npm run dev
npm run build
```

플랫폼 빌드는 `npm run build:mac`, `npm run build:win`, `npm run build:linux`을 사용한다. 업데이트·릴리스는 [활성 플랫폼 릴리스 정책](../../docs/architecture/desktop-release.md)을 따른다.
