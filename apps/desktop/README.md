# Workspace Desktop

Workspace Desktop은 Home·Editor·Terminal·Browser를 제공하는 Electron 앱이다. 파일 트리와 Quick Open, 파일 내용 검색, 파일 뷰어는 Editor 기능에 속한다. Editor는 선택한 로컬 폴더에서 직접 파일을 읽고 저장하며, 외부 도구가 동기화하는 폴더도 일반 로컬 폴더로 연다.

## 아키텍처와 개발

Runtime, layout, interaction, IPC, persistence와 Desktop host 계약은 [Desktop 문서](../../docs/architecture/workspace/README.md)를 참고한다. Home·Browser·Terminal·Editor의 기능 UI와 도메인 경계는 각각 [`packages/home`](../../packages/home/README.md), [`packages/browser`](../../packages/browser/README.md), [`packages/terminal`](../../packages/terminal/README.md), [`packages/editor`](../../packages/editor/README.md)가 설명한다.

```sh
npm run dev
npm run build
```

플랫폼 빌드는 `npm run build:mac`, `npm run build:win`, `npm run build:linux`을 사용한다. 업데이트·릴리스는 [활성 플랫폼 릴리스 정책](../../docs/architecture/desktop-release.md)을 따른다.
