# @workspace/terminal

Terminal 기능 패키지는 pane 화면과 pane-kind factory, host 계약, pane manager, 출력 스케줄링, fit/scroll/WebGL, 테마, 입력 정책, 키보드 레이아웃 추적, clipboard 붙여넣기 정책, 입력 queue, selection copy, 검색 UI, agent/title/status 도메인 및 renderer 상태 저장소를 소유한다. Desktop에는 Electron clipboard/PTY IPC, process/session 소유권, 플랫폼 키보드·입력 adapter, IPC DTO, singleton host 구현을 둔다.

기능은 `src/pane/`, `src/search/`, `src/input/`, `src/agent/`, `src/pane-manager/`, `src/shared/`, `src/terminal/`, `src/transport/` 아래에 도메인별로 둔다. package는 root API와 `agent`, `input`, `pane`, `pane-manager`, `search`, `shared`, `terminal`, `transport` 진입점을 공개한다. Desktop은 구현 leaf 경로를 직접 import하지 않는다.

pane visibility와 선택은 렌더링·focus만 제어한다. PTY attach/dispose 수명은 이 값에 종속되지 않는다. `TerminalPane`과 pane-kind factory는 package가 소유하고 `TerminalPaneHost`를 받는다. Desktop은 terminal 생성, PTY, agent store, clipboard, theme, input handler capability를 제공한다. 자세한 계약과 미검증 항목은 [Terminal 아키텍처](../../docs/architecture/workspace/terminal/README.md)를 참고한다.
