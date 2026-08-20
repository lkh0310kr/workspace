# TODO

- [x] `Cmd+,`로 Settings 다이얼로그 표시
- [x] Settings > Appearance에 Theme 설정 (light / dark / system)
- [x] Terminal GPU 가속/렌더링 — `crates/terminal-gpu`(자체 wgpu 렌더러)는 소스 주석에 "Archived... Not used by default xterm.js shell"이라고 명시된, 이미 폐기된 실험이었음(확인 완료, 추측 아님). 처음부터 폰트 아틀라스/그리드 diff/네이티브 서피스 임베딩을 다시 구현하는 건 CEF 임베딩 때와 같은 급의 오픈엔드 리스크라 되살리지 않기로 함 — 대신 xterm.js 공식 `@xterm/addon-webgl`(WebGL2 하드웨어 가속, context-loss 시 자동 폴백)을 연결해서 실질적 목표(GPU 가속 렌더링) 달성
- [x] Terminal/Markdown/Code Editor 패널에 `Cmd+F` 검색 기능
- [x] 앱 켜면 기본적으로 Full Screen 크기로 (maximized) — 지금은 한 80% 정도밖에 안 됨
- [x] 터미널 테마 설정 기능 — 앱 전체 light/dark 테마를 따라가도록 연동 완료
- [x] Split panel을 자유롭게 위치 이동할 수 있도록
- [x] Splitter(separator) 인식 범위 확대 — 현재 1px라 드래그하기 불편함
- [x] 앱 업데이트/재빌드 후에도 터미널 내용이 살아있도록 (참고: Orca는 업데이트해도 작업이 계속 진행됨). 커스텀 데몬/소켓을 새로 만드는 대신 tmux를 백엔드로 사용 — 이미 "클라이언트가 죽어도 세션은 산다"를 정확히 하는 검증된 도구라 새로 구현하는 것보다 훨씬 리스크가 낮음(`brew install tmux` 필요, 없으면 기존처럼 그냥 plain shell로 동작).
  - 터미널: 각 터미널이 `tmux new-session -A -s workspace-term-<id>`로 실행됨. `<id>`가 재시작해도 안 바뀌어야 같은 세션에 재접속되므로, 탭/레이아웃/터미널 id 전체를 `workspace.json`에 저장하고 재시작 시 복원하도록 함께 구현함 (`Workspace::from_snapshot`).
  - 실제로 이 기기에 tmux를 설치해서 직접 검증함 (`cargo test`로 재현 가능한 회귀 테스트 `pty_tmux_session_persists_across_reconnect` 추가) — 이 과정에서 두 개의 진짜 버그를 발견/수정:
    1. `portable_pty::CommandBuilder`는 `env_clear()` 하고 `SHELL`만 다시 넣음 — `HOME`이 없어서 tmux가 띄운 로그인 셸이 `~/.zshrc`를 못 찾고 조용히 스킵함. `HOME`/`USER`를 직접 다시 넣어서 해결.
    2. **치명적**: `portable_pty`의 `UnixMasterWriter::drop()`이 pty가 닫힐 때 EOF 바이트(Ctrl-D)를 흘려보내는데, 이게 tmux attach 클라이언트를 통해 세션의 실제 셸로 그대로 전달되어 — 앱을 끌 때마다 정확히 "보존하려던" 세션의 셸이 Ctrl-D로 종료되어버림. `Pty`의 `Drop`에서 `tmux detach-client -s <key>`를 먼저 실행해서 EOF가 도달하기 전에 클라이언트를 깨끗하게 분리하도록 수정. (직접 검증하지 않았으면 기능이 정확히 반대로 동작—껐다 켜면 오히려 세션이 사라짐—하는 채로 나갔을 버그.)
  - Claude 세션 등 "내부 세션" 개념은 현재 코드베이스에 없음(존재하지 않는 걸 만들어내지 않음) — 터미널 안에서 실행 중인 어떤 프로세스든(claude code 포함) 터미널 자체가 살아있으면 같이 살아있음.
- [x] Markdown 에디터를 Obsidian/Notion 스타일의 진짜 WYSIWYG 단일 뷰로 (헤딩/굵게/기울임/인라인코드/링크 — 테이블 등 더 복잡한 요소는 아직)
- [x] App icon 추가 (플레이스홀더 — 실제 디자인으로 나중에 교체 가능)
- [x] Workspace base path — 탭(Tab)별로 독립적으로 설정 가능하도록. "Workspace N" 명칭을 "Tab N"으로 변경, 각 탭 행에 설정(⚙) 버튼 추가
- [x] Markdown 에디터에 TreeView 추가 (파일 탐색 — 탭의 base path 기준)
- [ ] Markdown 에디터 고도화 — Obsidian과 동일한 live-preview 스펙 (버그 금지, 단계적으로 진행)
  - [x] `markdown()`이 strict CommonMark base라 GFM(취소선/태스크리스트/테이블)이 아예 파싱 안 되던 버그 수정 (`base: markdownLanguage`)
  - [x] 취소선 `~~text~~`
  - [x] 인용문(Blockquote) `>` — 마커 숨김 + 좌측 보더/들여쓰기
  - [x] 체크박스 태스크리스트 `- [ ]` — 실제 클릭 가능한 체크박스 위젯
  - [x] 구분선 `---` (HorizontalRule) — 실제 `<hr>` 렌더링
  - [x] 펜스 코드블록 ``` ``` ``` — 여는/닫는 fence 숨김 + 블록 배경
  - [x] 표(Table) — 커서가 표 밖에 있을 때만 실제 `<table>`로 렌더링 (편집 중엔 raw markdown). Table 노드가 정확히 줄 경계에서 시작/끝나는지 런타임에 확인 후에만 block decoration 사용 (CodeMirror는 block decoration이 정확히 줄 단위로 매핑되길 요구함 — 안 맞으면 그냥 raw text로 안전하게 폴백)
  - [x] 이미지 `![alt](url)` 인라인 렌더링 — http(s) 원격 URL만. 로컬 상대경로는 탭의 root_path를 Tauri asset-protocol scope로 동적 등록해야 하는데 아직 안 돼 있어서(런타임에 임의 디렉토리 허용) 의도적으로 raw text로 남겨둠 (반쯤 동작하는 것보다 안 하는 게 나음)
  - [x] Wikilink `[[note]]` / `[[note|alias]]` — `@lezer/markdown` InlineParser 직접 구현 (`ui/src/markdownWikilink.ts`). 스타일링만 하고 클릭 시 실제 노트로 이동하는 기능은 아직 없음 (탭/파일 열기 연동 필요 — 별도 작업)
  - [x] Callout `> [!note]` — 인용문 첫 줄이 `[!type]`으로 시작하면 라벨 뱃지로 렌더링 + 타입별 좌측 보더/배경색
  - [x] 리스트: 불릿 리스트 마커(`-`/`*`/`+`)를 실제 `•`로 렌더링 (커서가 그 줄에 있을 때는 원문 그대로 보임, 다른 요소들과 동일한 규칙). Ordered list 번호는 원래도 괜찮아서 그대로 둠
  - [ ] Wikilink 클릭 시 실제 파일로 이동/새로 만들기 (탭의 TreeView/파일 열기 로직과 연동 필요)
  - [ ] 로컬 이미지 렌더링 (asset-protocol scope를 탭 root_path에 맞춰 동적으로 열어줘야 함 — Rust 쪽 작업)
