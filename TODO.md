# TODO
- [ ] Pane UX를 Dialog -> 가벼운 Popover로 변경
- [ ] 브라우저
    - 구글 로그인 시 패스키 동작 안 함 -> 아예 막아서 비밀번호로 하든지 아니면 패스키 구현을 하든지 (orca 방식 참고)
    - 이 외에 브라우저 관련 기능 orca 참고해서 고도화 (지금 너무 불편해)

> **2026-08-24**: Tauri(Rust) 구현은 `legacy-tauri/`로 이동, Electron(`electron/`)이 메인 앱. 옛 Tauri 전용 히스토리(WKWebView/CEF/cargo Gatekeeper/portable_pty 관련 항목들)는 전부 `legacy-tauri/TODO.md`로 옮김 — 이 파일은 이제 `electron/` 기준으로만 씀.

내가 쓴 TODO:
- [ ] Bullet list raw,preview 간 간격 안 맞음. 그리고 checkbox때와 동일하게 커서가 불렛에 근접한 경우에만 raw로 표시하도록 (`electron/src/renderer/src/markdownLivePreview.ts`, Tauri 때부터 미해결 그대로 포팅됨)
- [ ] Pane Select Dialog - Code <-> Markdown Pane -> Editor 로 통합
- [ ] Markdown Editor Cmd + B등 단축키 기능 추가
- [ ] Editor Tab System VSCode, Zed 참고해서 완전 똑같이 수정. history front/back logic, tab new/replace logic ux이상함.

AI가 쓰는 TODO:
- [ ] 헤딩/링크 등으로 커서 이동 시 한 칸 밀리는 버그 — `EditorView.atomicRanges`로 고쳤었는데, TreeView에서 다른 파일을 열 때 CodeMirror 자체가 크래시하는("No tile at position N") 훨씬 심각한 회귀를 만들어서 되돌림(Tauri 시절 사용자가 직접 재현/리포트함). 캐시된 필드를 읽는 버전, `view.state`에서 매번 새로 계산하는 버전 둘 다 시도했지만 실제 앱에서 검증할 방법이 없어서 둘 다 버림 — 커서 한 칸 밀리는 건 크래시보다 훨씬 나은 상태라 일단 이대로 둠. `electron/src/renderer/src/markdownLivePreview.ts`에도 동일한 상태로 그대로 포팅됨. CM6 selection-mapping 내부 동작을 제대로 아는 사람이 다시 보거나, 실제로 띄워서 테스트할 수 있을 때 재시도할 것
- [x] **Electron 컨버팅 완료** (`electron/` 디렉토리, `electron-migration` 브랜치) — Tauri 전면 대체, Orca(`ref-proj/orca`) 방식을 따라감. PTY(node-pty+tmux, 회귀 테스트 포함), Workspace/파일 IPC, 네이티브 메뉴(Undo/Redo 제외), Browser pane(`<webview>` 태그, WKWebView z-order 버그 자체가 없음 — Orca 패턴), 레이아웃/워크스페이스 탭(flexlayout-react), CodeMirror 에디터 패널(TreeView/마크다운 라이브 프리뷰/autosave/wikilink), Claude/Cursor 사용량 상태바, Settings/AppSettings 다이얼로그까지 8개 task 전부 완료, 사용자가 직접 실행해서 확인함(한글 입력 포함: "지금 한글 입력도 잘 돼").
  - flexlayout-react가 옛 `ui/`의 0.8.17이 아니라 0.10.5로 설치됨(그대로 둠) — API가 바뀐 부분들: `Layout` ref 타입이 클래스가 아니라 `ILayoutApi`, `splitterSize`/`splitterExtra` model attribute가 없어지고 CSS 변수(`--flexlayout-splitter-size`)로 이동, `tabDragSpeed`가 model attribute에서 `<Layout>` 최상위 prop으로 이동.
  - Hangul IME 워크어라운드, Tauri 드래그드롭 API(`getCurrentWebview().onDragDropEvent`)는 의도적으로 포팅 안 함 — Chromium이 다른 IME 이벤트 모델이라 그대로 옮기면 안 됨(Orca의 xterm.js 패치로 대체, 실사용 확인 완료). OS 레벨 드래그드롭-투-터미널은 아직 Electron 쪽 구현 없음 — 필요하면 나중에 별도로.
  - 로컬 이미지 경로(`markdownLivePreview.ts`)는 Tauri의 asset-scope `convertFileSrc` 대신 plain `file://` URL로 대체, TreeView "Reveal in Finder"는 `shell.showItemInFolder` IPC로 대체. `fs.watch` 기반 파일 변경 감지(TreeView/에디터 외부 변경 리로드용)도 새로 추가함(Tauri 쪽 notify 워처의 Electron 대응).
  - Rust `claude_code_usage_recent`(JSONL 트랜스크립트 스캔 + 모델별 가격표)는 UI 어디서도 실제로 안 쓰이길래(grep으로 확인) 이식 안 함 — `ClaudeUsageStatusBar.tsx`가 실제로 쓰는 건 `claude_rate_limit_status`/`cursor_usage_status`뿐.
  - 스크린샷 기반 시각 검증은 사용자 지시로 이번 마이그레이션 내내 안 함 — typecheck+build로만 검증, 실제 동작 확인은 사용자가 직접 함.
- [x] **Settings Browse… 버튼 IPC 실패가 조용히 무시되던 버그** — 2026-08-24. `SettingsDialog.tsx`의 `browse()`가 `openDirectoryDialog()`를 try/catch 없이 await해서, invoke가 실패하면(예: 메인 프로세스가 아직 `dialog:open-directory` 핸들러 없는 옛 빌드로 떠 있는 채였던 경우) unhandled rejection으로 조용히 사라지고 버튼이 그냥 안 되는 것처럼 보였음. 기존 `error` state를 재사용해서 실패를 다이얼로그에 표시하도록 수정.
