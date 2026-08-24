# TODO
- [ ] 브라우저
    - [ ] 이 외에 브라우저 관련 기능 orca 참고해서 고도화 (지금 너무 불편해) — 다음 후보: 실제 파비콘 표시, 탭별 히스토리 뒤로/앞으로 목록(길게 누르면 드롭다운), 다운로드 UI, 확대/축소
- [ ] Editor/Makdown
    - [ ] 검색, 목차 기능 오른쪽 상단으로 floating position.
    - [ ] 검색 기능 UI 너무 옛날 스타일인 이슈 -> vscode 비슷한 구조로 ui 개선.
    - [ ] TreeView toggle 상태 저장 안됨 - 다른 것도 체크
- [ ] Workspace
    - [ ] Tab split horizonta/vertical icon이 필요할까? 탭 추가하고 이동하면 될 거 같은데.
    - [ ] MacOS Native Header의 Sidebar Toggle 버튼 hover시 popover selector 표시하여 quick selecting할 수 있도록
    - [ ] Pane UX를 Dialog -> 가벼운 Popover로 변경
- [ ] Bullet list raw,preview 간 간격 안 맞음. 그리고 checkbox때와 동일하게 커서가 불렛에 근접한 경우에만 raw로 표시하도록 (`electron/src/renderer/src/markdownLivePreview.ts`, Tauri 때부터 미해결 그대로 포팅됨)
- [ ] Pane Select Dialog - Code <-> Markdown Pane -> Editor
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
  - typecheck+build만으로 검증(스크린샷 검증 금지 지시 유지) — 실사용 확인 필요.
- [x] **탭 전환이 부드럽지 않고 안 되는 케이스가 많던 버그** — 2026-08-24. 사용자 리포트("orca처럼 부드럽지 않음. 안 되는 케이스가 너무 많음") 조사 후 두 가지 실제 원인 발견/수정:
  1. **브라우저 탭이 배경으로 갔다가 돌아오면 하얗게/멈춘 채로 뜸**: `PaneGroup.tsx`가 비활성 탭을 `display:none`으로 숨기고 있었는데, Electron `<webview>`는 조상 요소가 `display:none`이 되면 게스트 렌더러가 서스펜드/블랭크되는 게 알려진 문제임 — 예전 `BrowserPane.tsx`는 `visibility:hidden`만 썼었는데(레이아웃 트리에 남겨둠) 이번 globalize 작업에서 실수로 `display:none`으로 바뀌었었음. `visibility:hidden`+`pointerEvents:none`으로 되돌려서 수정.
  2. **탭 전환이 느리고 가끔 화면에 반영이 안 됨**: 탭 클릭 → `setActiveTabInGroup`(flexlayout model 액션) → `onNotifyChanged`(App.tsx의 `bumpLayout`: persistLayout 디바운스 + `setModelEpoch` + App 리렌더 + Layout 리렌더 + factory 재호출) 이 전체 왕복이 끝나야 화면에 반영되는 구조였음 — 클릭마다 무거운 model round-trip을 거치니 느리고, 이 경로 중간 어딘가서 깨지면 아예 반영이 안 됨. `PaneGroup`이 표시할 탭을 로컬 React state(`localActiveId`)로 관리하도록 바꿔서 클릭은 즉시 반영되고, model에는 그 뒤에 비동기로(디바운스된 저장처럼) 따라가도록 분리함.
  - 부가로 탭 스트립 전체에 pane 재배치용 `draggable`이 걸려있어서 탭 칩 클릭이 드래그 제스처에 먹힐 수 있는 것도 발견 — 각 칩/버튼에 `draggable={false}` 명시해서 방지.
  - typecheck+build로만 검증, 실제 탭 전환 체감은 사용자 확인 필요.
- [ ] 헤딩/링크 등으로 커서 이동 시 한 칸 밀리는 버그 — `EditorView.atomicRanges`로 고쳤었는데, TreeView에서 다른 파일을 열 때 CodeMirror 자체가 크래시하는("No tile at position N") 훨씬 심각한 회귀를 만들어서 되돌림(Tauri 시절 사용자가 직접 재현/리포트함). 캐시된 필드를 읽는 버전, `view.state`에서 매번 새로 계산하는 버전 둘 다 시도했지만 실제 앱에서 검증할 방법이 없어서 둘 다 버림 — 커서 한 칸 밀리는 건 크래시보다 훨씬 나은 상태라 일단 이대로 둠. `electron/src/renderer/src/markdownLivePreview.ts`에도 동일한 상태로 그대로 포팅됨. CM6 selection-mapping 내부 동작을 제대로 아는 사람이 다시 보거나, 실제로 띄워서 테스트할 수 있을 때 재시도할 것