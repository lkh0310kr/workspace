# TODO
- [ ] Pane UX를 Dialog -> 가벼운 Popover로 변경
- [ ] 브라우저
    - [x] 구글 로그인 시 패스키 동작 안 함 — 2026-08-24. Orca 방식(accounts.google.com/accounts.youtube.com에서만 Firefox User-Agent로 위장) 포팅해서 로그인 화면 자체는 통과함(`electron/src/main/browserSessionUA.ts`). 그런데 "패스키로 로그인 완료" 단계에서 멈춤 — Touch ID/platform authenticator 프롬프트가 아예 안 뜨는 걸로 보임(앱이 서명 안 된 dev 빌드라서일 가능성 높음, Orca도 이 부분은 딱히 해결한 코드가 없었음). **당장은 "다른 방법으로 로그인"으로 비밀번호/OTP 우회하면 됨.** 진짜 Touch ID 패스키 자체를 되게 하려면 앱 코드사이닝부터 필요하고 그래도 되는지 불확실 — 나중에 필요하면 다시.
    - [x] URL 입력창 UX 개선 — 2026-08-24. 방문 기록 기반 자동완성 드롭다운(`browserHistory.ts`+`browserAddressBarSuggestions.ts`, Orca `browser-address-bar-suggestions.ts` 포팅, Radix/Zustand 없이 순수 localStorage+커스텀 드롭다운으로 재구현), 포커스 시 전체 선택, Escape로 실제 현재 URL로 되돌리기, 화살표 위/아래로 후보 미리보기, Enter는 항상 입력된 텍스트로 이동(크롬처럼), Cmd+L로 주소창 포커스, 뒤로/앞으로 버튼 실제 `canGoBack/canGoForward` 반영. URL 정규화 로직(`browserUrl.ts`)도 Orca의 `normalizeBrowserNavigationUrl` 포팅(로컬 개발주소, 절대경로→file://, 검색어 판별 등).
    - [ ] 이 외에 브라우저 관련 기능 orca 참고해서 고도화 (지금 너무 불편해) — 다음 후보: 실제 파비콘 표시, 탭별 히스토리 뒤로/앞으로 목록(길게 누르면 드롭다운), 다운로드 UI, 확대/축소

> **2026-08-24**: Tauri(Rust) 구현은 `legacy-tauri/`로 이동, Electron(`electron/`)이 메인 앱. 옛 Tauri 전용 히스토리(WKWebView/CEF/cargo Gatekeeper/portable_pty 관련 항목들)는 전부 `legacy-tauri/TODO.md`로 옮김 — 이 파일은 이제 `electron/` 기준으로만 씀.

내가 쓴 TODO:
- [ ] Bullet list raw,preview 간 간격 안 맞음. 그리고 checkbox때와 동일하게 커서가 불렛에 근접한 경우에만 raw로 표시하도록 (`electron/src/renderer/src/markdownLivePreview.ts`, Tauri 때부터 미해결 그대로 포팅됨)
- [x] Pane Select Dialog - Code <-> Markdown Pane -> Editor 로 통합 — 2026-08-24. 아래 "탭 시스템 globalize" 작업으로 다른 형태로 해결됨: "타입 변경" 다이얼로그 자체가 없어지고, pane 안에서 탭을 새로 열 때(+) 어떤 kind든 고를 수 있는 방식으로 바뀜 — PanePicker.tsx가 그 역할.
- [ ] Markdown Editor Cmd + B등 단축키 기능 추가
- [x] Editor Tab System VSCode, Zed 참고해서 완전 똑같이 수정. history front/back logic, tab new/replace logic ux이상함. — 2026-08-24. 아래 "탭 시스템 globalize" 작업으로 완전히 새로 짬(파일 히스토리 앞/뒤 대신 진짜 브라우저처럼 탭 여러 개). UX가 VSCode/Zed와 100% 동일하진 않음(드래그 재정렬 등은 없음) — 필요하면 추가로.

AI가 쓰는 TODO:
- [x] **에디터의 멀티탭 시스템을 전체 pane(터미널/브라우저 포함)으로 globalize** — 2026-08-24. Orca가 터미널/브라우저/에디터를 전부 하나의 "unified tab" 리스트로 다루는 구조를 (worktree/원격서버/pinning/시뮬레이터/Windows shell 메뉴 등 Orca 전용 기능은 빼고) 구조만 이식함. 핵심 변경:
  - `layout/paneTypes.ts`: `PaneComponent`+`PaneConfig`(pane당 콘텐츠 1개) → `PaneGroupConfig{tabs: PaneTabItem[], activeTabId}`(pane당 이종 탭 여러 개)로 데이터 모델 자체를 바꿈.
  - `components/PaneTabStrip.tsx`(구 `EditorTabBar.tsx`를 일반화): 모든 pane 종류가 공유하는 탭 칩 스트립 — 탭 클릭 전환, 닫기, "+"로 새 탭(터미널/브라우저/코드/마크다운 아무거나) 추가, split 버튼.
  - `panes/PaneGroup.tsx`(신규): flexlayout factory가 이제 항상 이걸 렌더링 — 탭 스트립 + (에디터 탭일 때만) 파일 탐색기 사이드바 소유. 열린 탭 전부를 동시에 마운트해두고 `display`로만 숨겨서(브라우저 페이지 상태/터미널 스크롤백/에디터 draft가 탭 전환해도 안 사라지게) 전환함.
  - `panes/EditorContent.tsx`(구 `EditorPane.tsx`에서 분리): 파일 하나 전용 콘텐츠만 남음 — 자체 멀티탭/파일간 히스토리 뒤로가기 기능은 삭제(진짜 탭으로 대체됐으니 중복 기능이었음). 위키링크 클릭은 이제 새 탭을 여는 걸로 동작.
  - `panes/BrowserContent.tsx`(구 `BrowserPane.tsx`에서 분리): 페이지 하나 전용(webview+자기 nav바) — 탭 여러 개 열기/닫기는 PaneGroup이 담당.
  - `main/layout.ts`: `defaultLayout`/`extractTerminalIds`를 새 중첩 구조에 맞게 수정, **기존에 저장된 옛 형식 layoutJson도 여전히 읽을 수 있게** legacy fallback 유지(`obj.component === "terminal"` 체크 그대로 둠) — 안 그러면 이번 업데이트 이전에 켜져있던 워크스페이스의 터미널 세션이 다음 재시작 때 복원 안 됐을 것.
  - `App.tsx`: 구 layoutJson(레거시 단일-아이템 탭)을 새 `PaneGroupConfig`로 감싸는 마이그레이션(`migrateLegacyTabNode`)을 `parseLayout`에 추가 — 렌더러 쪽도 하위호환.
  - typecheck+build만으로 검증(스크린샷 검증 금지 지시 유지) — 실사용 확인 필요. — `EditorView.atomicRanges`로 고쳤었는데, TreeView에서 다른 파일을 열 때 CodeMirror 자체가 크래시하는("No tile at position N") 훨씬 심각한 회귀를 만들어서 되돌림(Tauri 시절 사용자가 직접 재현/리포트함). 캐시된 필드를 읽는 버전, `view.state`에서 매번 새로 계산하는 버전 둘 다 시도했지만 실제 앱에서 검증할 방법이 없어서 둘 다 버림 — 커서 한 칸 밀리는 건 크래시보다 훨씬 나은 상태라 일단 이대로 둠. `electron/src/renderer/src/markdownLivePreview.ts`에도 동일한 상태로 그대로 포팅됨. CM6 selection-mapping 내부 동작을 제대로 아는 사람이 다시 보거나, 실제로 띄워서 테스트할 수 있을 때 재시도할 것