# TODO
- [ ] Terminal
  - [ ] Claude Code/Cursor 등 AI Agent 사용량 하단에 표시.
  - [ ] 터미널 하단 초록색 info text삭제하고 그걸 상단 헤더 "Terminal" text를 대체
- [ ] Editor
  - [ ] 다른 탭 전환시 selected file이 상태 저장불러오기가 안됨. 워크스페이스를 종료했다가 다시 켜도.
  - [ ] Markdown
    - [ ] Checkbox Raw <-> Preview Detail. Checkbox 쪽으로 커서를 왼쪽 옮겨서 Checkbox를 침해했을때 그때 Raw로 표시하도록. Obsidian이 이런 방식을 사용함.
    - [ ] Indent 2-> 4로 수정
    - [ ] obsidian처럼 indent(4) 만큼 띄어쓰기인 경우 vertical line을 표시해서 얼마나 인덴트됐는지 파악할 수 있도록
  - [ ] TreeView
    - [ ] zed처럼 vertical line표시해서 depth 시각화
    - [ ] root container width 조정할 수 있도록
- [ ] Workspace
  - [ ] MacOS Native Window Header Bar
    - [ ] Toogle Sidebar 버튼 추가해서 왼쪽 Tabs display 토클하도록.
  - [ ] 각 Pane에서 Cmd + '+', Cmd + '-' Action 구현 - 각 패널의 독립된 사이즈. 상태저장되도록


아래는 AI가 입력한 TODO

- [ ] Terminal GPU 가속/렌더링 — `crates/terminal-gpu`(자체 wgpu 렌더러)는 소스 주석에 "Archived... Not used by default xterm.js shell"이라고 명시된, 이미 폐기된 실험이었음(확인 완료, 추측 아님). 처음부터 폰트 아틀라스/그리드 diff/네이티브 서피스 임베딩을 다시 구현하는 건 CEF 임베딩 때와 같은 급의 오픈엔드 리스크라 되살리지 않기로 함 — 대신 xterm.js 공식 `@xterm/addon-webgl`을 연결했었는데, 사용자가 직접 재현/리포트("터미널 전체가 언더스코어로 표시됨") — WebGL 글리프 아틀라스가 깨지는 걸로 추정되는 심각한 렌더링 버그가 있어서 완전히 제거함(이미 한 번 dispose 크래시도 냈던 전례가 있어 신뢰도가 낮았음). GPU 가속은 필수 기능이 아니라 "있으면 좋은" 것이었어서, 검증된 기본 렌더러로 되돌리는 게 안전한 선택 — 재시도하려면 실제로 띄워서 테스트할 수 있을 때 다시 볼 것
  - 터미널: 각 터미널이 `tmux new-session -A -s workspace-term-<id>`로 실행됨. `<id>`가 재시작해도 안 바뀌어야 같은 세션에 재접속되므로, 탭/레이아웃/터미널 id 전체를 `workspace.json`에 저장하고 재시작 시 복원하도록 함께 구현함 (`Workspace::from_snapshot`).
  - 실제로 이 기기에 tmux를 설치해서 직접 검증함 (`cargo test`로 재현 가능한 회귀 테스트 `pty_tmux_session_persists_across_reconnect` 추가) — 이 과정에서 두 개의 진짜 버그를 발견/수정:
    1. `portable_pty::CommandBuilder`는 `env_clear()` 하고 `SHELL`만 다시 넣음 — `HOME`이 없어서 tmux가 띄운 로그인 셸이 `~/.zshrc`를 못 찾고 조용히 스킵함. `HOME`/`USER`를 직접 다시 넣어서 해결.
    2. **치명적**: `portable_pty`의 `UnixMasterWriter::drop()`이 pty가 닫힐 때 EOF 바이트(Ctrl-D)를 흘려보내는데, 이게 tmux attach 클라이언트를 통해 세션의 실제 셸로 그대로 전달되어 — 앱을 끌 때마다 정확히 "보존하려던" 세션의 셸이 Ctrl-D로 종료되어버림. `Pty`의 `Drop`에서 `tmux detach-client -s <key>`를 먼저 실행해서 EOF가 도달하기 전에 클라이언트를 깨끗하게 분리하도록 수정. (직접 검증하지 않았으면 기능이 정확히 반대로 동작—껐다 켜면 오히려 세션이 사라짐—하는 채로 나갔을 버그.)
  - Claude 세션 등 "내부 세션" 개념은 현재 코드베이스에 없음(존재하지 않는 걸 만들어내지 않음) — 터미널 안에서 실행 중인 어떤 프로세스든(claude code 포함) 터미널 자체가 살아있으면 같이 살아있음.
  - [ ] 헤딩/링크 등으로 커서 이동 시 한 칸 밀리는 버그 — `EditorView.atomicRanges`로 고쳤었는데, TreeView에서 다른 파일을 열 때 CodeMirror 자체가 크래시하는("No tile at position N") 훨씬 심각한 회귀를 만들어서 되돌림(사용자가 직접 재현/리포트함). 캐시된 필드를 읽는 버전, `view.state`에서 매번 새로 계산하는 버전 둘 다 시도했지만 실제 앱에서 검증할 방법이 없어서 둘 다 버림 — 커서 한 칸 밀리는 건 크래시보다 훨씬 나은 상태라 일단 이대로 둠. CM6 selection-mapping 내부 동작을 제대로 아는 사람이 다시 보거나, 실제로 띄워서 테스트할 수 있을 때 재시도할 것
- [ ] 브라우저(Browser/Browser-Chromium) 패널이 항상 맨 위(z-order)에 뜨는 문제 — 다른 패널이나 다이얼로그를 가림. WKWebView/CEF 네이티브 차일드 뷰 특성상 흔한 문제(overlayBarrier로 splitter 드래그 중엔 이미 우회 중인데, 다른 상황에서도 필요할 수 있음)
- [ ] Terminal 패널 안에서 Claude Code 실행 중일 때 Cmd+[?] 관련 문제 — 사용자 메시지가 깨져서 정확한 재현 조건 확인 필요 (다음 대화에서 재질문)
