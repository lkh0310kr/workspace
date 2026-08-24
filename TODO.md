# TODO
- [ ] Pane UX를 Dialog -> 가벼운 Popover로 변경
- [ ] 브라우저
    - [x] 구글 로그인 시 패스키 동작 안 함 — 2026-08-24. Orca 방식(accounts.google.com/accounts.youtube.com에서만 Firefox User-Agent로 위장) 포팅해서 로그인 화면 자체는 통과함(`electron/src/main/browserSessionUA.ts`). 그런데 "패스키로 로그인 완료" 단계에서 멈춤 — Touch ID/platform authenticator 프롬프트가 아예 안 뜨는 걸로 보임(앱이 서명 안 된 dev 빌드라서일 가능성 높음, Orca도 이 부분은 딱히 해결한 코드가 없었음). **당장은 "다른 방법으로 로그인"으로 비밀번호/OTP 우회하면 됨.** 진짜 Touch ID 패스키 자체를 되게 하려면 앱 코드사이닝부터 필요하고 그래도 되는지 불확실 — 나중에 필요하면 다시.
    - [x] URL 입력창 UX 개선 — 2026-08-24. 방문 기록 기반 자동완성 드롭다운(`browserHistory.ts`+`browserAddressBarSuggestions.ts`, Orca `browser-address-bar-suggestions.ts` 포팅, Radix/Zustand 없이 순수 localStorage+커스텀 드롭다운으로 재구현), 포커스 시 전체 선택, Escape로 실제 현재 URL로 되돌리기, 화살표 위/아래로 후보 미리보기, Enter는 항상 입력된 텍스트로 이동(크롬처럼), Cmd+L로 주소창 포커스, 뒤로/앞으로 버튼 실제 `canGoBack/canGoForward` 반영. URL 정규화 로직(`browserUrl.ts`)도 Orca의 `normalizeBrowserNavigationUrl` 포팅(로컬 개발주소, 절대경로→file://, 검색어 판별 등).
    - [ ] 이 외에 브라우저 관련 기능 orca 참고해서 고도화 (지금 너무 불편해) — 다음 후보: 실제 파비콘 표시, 탭별 히스토리 뒤로/앞으로 목록(길게 누르면 드롭다운), 다운로드 UI, 확대/축소

> **2026-08-24**: Tauri(Rust) 구현은 `legacy-tauri/`로 이동, Electron(`electron/`)이 메인 앱. 옛 Tauri 전용 히스토리(WKWebView/CEF/cargo Gatekeeper/portable_pty 관련 항목들)는 전부 `legacy-tauri/TODO.md`로 옮김 — 이 파일은 이제 `electron/` 기준으로만 씀.

내가 쓴 TODO:
- [ ] Bullet list raw,preview 간 간격 안 맞음. 그리고 checkbox때와 동일하게 커서가 불렛에 근접한 경우에만 raw로 표시하도록 (`electron/src/renderer/src/markdownLivePreview.ts`, Tauri 때부터 미해결 그대로 포팅됨)
- [ ] Pane Select Dialog - Code <-> Markdown Pane -> Editor 로 통합
- [ ] Markdown Editor Cmd + B등 단축키 기능 추가
- [ ] Editor Tab System VSCode, Zed 참고해서 완전 똑같이 수정. history front/back logic, tab new/replace logic ux이상함.

AI가 쓰는 TODO:
- [ ] 헤딩/링크 등으로 커서 이동 시 한 칸 밀리는 버그 — `EditorView.atomicRanges`로 고쳤었는데, TreeView에서 다른 파일을 열 때 CodeMirror 자체가 크래시하는("No tile at position N") 훨씬 심각한 회귀를 만들어서 되돌림(Tauri 시절 사용자가 직접 재현/리포트함). 캐시된 필드를 읽는 버전, `view.state`에서 매번 새로 계산하는 버전 둘 다 시도했지만 실제 앱에서 검증할 방법이 없어서 둘 다 버림 — 커서 한 칸 밀리는 건 크래시보다 훨씬 나은 상태라 일단 이대로 둠. `electron/src/renderer/src/markdownLivePreview.ts`에도 동일한 상태로 그대로 포팅됨. CM6 selection-mapping 내부 동작을 제대로 아는 사람이 다시 보거나, 실제로 띄워서 테스트할 수 있을 때 재시도할 것