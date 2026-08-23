# TODO

- [ ] Terminal
  - [x] Claude Code/Cursor 등 AI Agent 사용량 하단에 표시.
  - [x] 터미널 하단 초록색 info text삭제하고 그걸 상단 헤더 "Terminal" text를 대체
- [ ] Editor
  - [ ] 다른 탭 전환시 selected file이 상태 저장불러오기가 안됨. 워크스페이스를 종료했다가 다시 켜도.
  - [ ] Markdown
    - [ ] Checkbox Raw <-> Preview Detail. Checkbox 쪽으로 커서를 왼쪽 옮겨서 Checkbox를 침해했을때 그때 Raw로 표시하도록. Obsidian이 이런 방식을 사용함. 즉, current line을 select한 경우에도 체크박스를 클릭할 수 있다는 것. 아 그리고 지금 체크박스 클릭 했을때 [ ] \[x] 적용도 안 됨.
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
- [ ] 브라우저(Browser) 패널이 항상 맨 위(z-order)에 뜨는 문제 — 다른 패널이나 다이얼로그를 가림. WKWebView 네이티브 차일드 뷰 특성상 흔한 문제(overlayBarrier로 splitter 드래그 중엔 이미 우회 중인데, 다른 상황에서도 필요할 수 있음)
- [x] **CEF(Browser-Chromium) 완전 제거** — 2026-08-23. 사용자 요청으로 삭제. 근본 원인: `bundle-cef-app`이 생성하는 Info.plist가 `LSFileQuarantineEnabled=true`를 기본값으로 박아넣고 있었고, 이 앱(그리고 그 안의 터미널 패널)이 만드는 파일들이 전부 격리(quarantine) 태그를 받아 Gatekeeper/XProtect에 반복적으로 막히는 원인 중 하나였음(직접 Info.plist 비교로 확인 — Orca 앱엔 이 키 자체가 없음). CEF 자체도 미해결 SIGSEGV(#456)가 있던 불안정한 의존성이었음. 제거 내역: `src/cef_host.rs`, `src/bin/workspace-app_helper.rs`, Cargo.toml의 `cef`/`objc2*` 의존성, `ui/src/panes/CefBrowserPane.tsx` 및 `ui/src/panes/cef/`, `ui/src/browser/{cefBrowser,useCefBrowserHost}.ts`, `browser-cef` PaneComponent, `entitlements/{gpu,alerts,plugin,renderer}.plist`. `scripts/dev-run.sh`도 `bundle-cef-app` 없이 직접 `.app` 번들을 만드는 훨씬 단순한 스크립트로 재작성함 — CEF의 Frameworks/Helpers 구조 요구사항이 없어져서 raw `cargo run -p workspace-app`도 다시 그냥 됨.
- [x] **한글(Hangul) 입력 시 조합이 깨지는 버그** — 2026-08-23. 터미널 패널(및 그 안에서 도는 Claude Code CLI 등 모든 프로그램)에서 "반갑습니다"를 치면 "ㅂㄱ스ㄴ다"처럼 자모가 분해된 채로 들어가던 문제, 1주일 넘게 원인 불명이었음. 근본 원인: WKWebView의 한글(2벌식) 입력기가 `compositionstart/update/end` DOM 이벤트를 아예 안 쏘고, `input` 이벤트가 대응하는 `keydown`보다 먼저 옴 — xterm.js는 "keydown 없이 들어온 input"을 모바일 IME 커밋으로 오인해서 아직 조합 중인(뒤에서 `insertReplacementText`로 계속 수정될) 첫 자모를 성급히 PTY로 전송해버리고, 이후 수정본은 xterm이 아예 처리 안 하는 이벤트 타입이라 버려짐. 동일 근본 원인 계열의 업스트림 이슈: [xtermjs/xterm.js#5887](https://github.com/xtermjs/xterm.js/issues/5887)(다른 IME들에서도 같은 `_keyDownSeen` 게이트가 문제). 실제 `[hangul-trace]` 캡처 로그로 발동 조건을 정확히 특정한 뒤 재현 → 수정 → 재현을 반복 검증함(추측 아님).
  - 수정 위치: `ui/src/panes/TerminalPane.tsx` — `term.textarea`의 조상 요소(`host`)에 xterm보다 먼저 도는 capture-phase `input`/`keydown` 리스너를 달아서, 한글 조합 이벤트는 xterm에 안 넘기고 직접 관리. 다음 음절 블록이 시작되거나, 조합과 무관한 키가 오거나, 500ms 동안 입력이 없을 때만 "완성된" 텍스트를 PTY로 보냄.
  - 수정 과정에서 실제로 잡은 부가 버그 4개(전부 재현 로그로 확인):
    1. Shift 키(쌍자음 ㅆ/ㄲ/ㄸ/ㅃ/ㅉ 입력용)를 조합 무관 키로 오인해서 flush — "있다"가 "이다"로 잘림. 수정자 키(Shift/Control/Alt/Meta/CapsLock)는 boundary flush에서 제외.
    2. Enter처럼 조합과 무관하지만 `input` 이벤트를 안 쏘는 키(Backspace/Tab 등)는 원래 boundary 체크가 놓쳐서, 마지막 미완성 음절이 Enter보다 늦게(500ms idle 이후) 도착 — `keydown`도 별도로 가로채서 커버.
    3. `hangulSentLength`(이미 보낸 위치 추적용)가 xterm 자체 경로가 textarea를 리셋하는 걸 못 따라가서 계속 누적 — 한글 전체가 조용히 사라짐. textarea 길이가 줄어들면 리싱크하도록 수정.
    4. **띄어쓰기 중복**: 일반 문자(스페이스 포함)는 xterm 자체 keydown 경로로 이미 전송되는데, 제 boundary 로직이 그 위에 또 한 번 전송 — 조합 무관 문자는 xterm에게 맡기고 그 길이만큼 "보낸 걸로 표시"만 하도록 수정.
  - 부가로 타이핑 중 화면에 아무 표시도 안 뜨던 문제(위 로직이 xterm 기본 echo를 막아버리기 때문)도 로컬 미리보기 렌더링(erase-then-write ANSI 시퀀스, `\x1b[nD`/`\x1b[nX`)으로 보완. PTY 왕복 지연으로 미리보기가 실제 에코와 겹치는 레이스 컨디션이 있어서, 전송 직후 20ms 유예를 두고 폭이 같으면 지우지 않고 덮어쓰는 식으로 완화(완벽한 보장은 아니지만 실사용 타이핑 속도에선 검증됨).
  - 겹받침(값/앉다/넓다/많다), 빠른 연타, 한영 전환, 자모만 연속 입력 등 스트레스 테스트 통과. 백스페이스/Tab 자동완성/Ctrl+C/붙여넣기/화살표/키 반복 조합은 아직 미검증 — 다음에 필요하면 이어서.
- [x] **cargo 빌드가 macOS Gatekeeper에 막히던 문제 (코드 문제 아니었음, 근본 원인 특정 완료)** — 2026-08-23. "XProtect가 이 기기 전체를 막는 시스템 이슈"로 추측했던 이전 기록은 틀렸음(정정). 실제 원인: **workspace-app.app이 띄운 tmux 세션** 위에서 cargo를 돌리면, macOS가 그 세션에서 파생된 모든 새 파일(빌드 스크립트 바이너리, 심지어 git object까지)에 `com.apple.quarantine`을 workspace-app을 "책임 앱(responsible process)"으로 찍어버리고, Gatekeeper가 실행 시점에 SIGKILL로 죽임. workspace-app.app이 unsigned/ad-hoc 빌드라 이 전파가 일어남. tmux 서버는 최초로 띄운 workspace-app.app이 죽은 뒤에도 독립적으로 계속 살아있어서, 나중에 별도 iTerm 창에서 그 **같은 tmux 소켓**에 `attach`해도 동일하게 막힘(그래서 처음엔 "iTerm에서도 재현되니 앱 문제가 아니다"로 오판했었음). `echo $TMUX`가 비어있는(=workspace-app tmux를 전혀 안 거치는) 완전히 새 터미널 창에서 빌드하면 문제없음 — 이게 실질적인 해결책. 근본적으로는 workspace-app.app을 정식 서명(Developer ID, Team B42SPPS3PR 보유 중)하면 이 전파 자체가 안 생길 가능성이 높음(미검증, 다음에 시도).
- [x] **Claude Code rate-limit 진행바** — 사용자가 실제 빌드로 확인 완료(위 3번 항목). ("Claude Code <bar> N% used 4h 52m" — Orca UI 참고해서 구현) — 2026-08-23 재검토. 위 Gatekeeper 원인이 이제 밝혀져서 더 이상 막혀있지 않음. 로직도 재확인함: 이 세션 자체가 이미 `~/Library/Application Support/workspace-app/claude-statusline.json`을 실제로 채워놓은 상태였고(훅이 정상 설치·작동 중), 그 실데이터(`rate_limits.five_hour.used_percentage: 90`, `resets_at: 1787496000`)가 `parse_rate_limit_window`(src/lib.rs)가 기대하는 필드명과 정확히 일치함(추측이 아니라 실제 파일로 확인) — 백엔드 로직에 버그 없음. 남은 건 tmux 안 거치는 터미널에서 빌드해서 상태바에 진행바가 실제로 뜨는지 눈으로 확인하는 것뿐. 구현 내용:
  - `src/lib.rs`: `install_claude_statusline_hook()` — `~/.claude/settings.json`의 `statusLine.command`를 우리 wrapper 스크립트(`~/Library/Application Support/workspace-app/claude-statusline.sh`)로 교체. **주의**: 이 사용자는 이미 Orca 자체 statusLine 훅이 설치되어 있었음(Orca도 쓰는 사용자) — 그래서 기존 커맨드를 `claude-statusline-orig-command.sh`에 백업해두고 wrapper가 stdin을 그대로 원래 커맨드에도 체이닝해서 넘겨줌 (Orca 사용량 추적 안 깨지게). 이 체이닝 로직 자체는 `/tmp`에서 bash로 직접 시뮬레이션해서 검증 완료(정상 동작 확인) — Rust 쪽 문자열 생성/설치 로직만 실제 앱 빌드로 아직 검증 못 함.
  - `claude_rate_limit_status` 커맨드가 그 훅이 써주는 JSON 파일(`claude-statusline.json`)을 읽어서 `five_hour`/`seven_day` 윈도우의 `used_percentage`, `resets_at` 반환.
  - `ui/src/components/ClaudeUsageStatusBar.tsx`에 진행바(퍼센트별 초록/노랑/빨강) + reset countdown 추가함.
  - 빌드 성공하면: 앱 실행 → 터미널에서 `claude` 한번 실행해서 응답 받아야 훅이 최소 1번 트리거됨 → 하단 상태바에 진행바 뜨는지 확인.
