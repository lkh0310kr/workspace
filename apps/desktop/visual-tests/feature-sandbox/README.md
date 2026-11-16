# 기능 패키지 샌드박스

`@workspace/home`, `@workspace/browser`, `@workspace/terminal`을 메모리 기반 host capability로 직접 mount합니다. Electron을 시작하거나 Workspace 및 `PaneGroup`을 만들지 않습니다.

이 디렉터리에서 `npm run dev`를 실행하고 상단 버튼으로 Home, Browser, Terminal을 전환합니다. Browser 탐색은 로컬에서 모의 처리하고 Terminal은 메모리 PTY transport를 사용합니다.

`npm run build`와 `npm run typecheck`으로 독립 진입점을 확인합니다. 이 샌드박스는 패키지 mount와 화면 구성을 확인하며 실제 Electron guest·PTY 수명 동등성은 검증하지 않습니다. 기능 계약은 저장소 root의 `docs/architecture/pane-modularization.md`를 참고하세요.
