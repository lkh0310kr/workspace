다음 방향 (2026-08-28 최종): Phase 2는 그래픽/설계/CAD급 pane(Figma/Illustrator/
Photoshop급 2D, Blender급 3D, Video Editor, CAD/Omniverse식/Game Engine) — 직접
구현 아니고 실제 오픈소스 엔진을 fork/embed. 첫 타깃 **Game Engine(Godot)**,
Web export를 webview로 host하는 방식 확정. 근거/배경: [docs/ideation.md](docs/ideation.md),
[docs/ROADMAP.md](docs/ROADMAP.md) Phase 1/2. 엔지니어링/분석 pane 목록(Database Studio 등)은 보류(삭제 아님).

**최우선 원칙(기억)**: 안정화/검증 우선 — foundation 조각 하나 만들면 다음 걸로
넘어가기 전에 그게 실제로 작동하는지 검증부터.

- [x] **Engine bundle protocol 라이브 검증** (2026-08-28) — smoke test
  fixture ALL CHECKS PASSED, 진짜 Godot 데모(godot-demo-web)도 실제로 돌아가는
  것까지 확인 완료. 중간에 발견된 버그: Browser pane webview가 `persist:browser`
  세션을 쓰는데 프로토콜을 default session에만 등록해서 sandbox 부트스트랩이
  깨졌던 것 — `session.fromPartition(BROWSER_SESSION_PARTITION)`에 등록하도록
  수정(`engineBundleProtocol.ts`/`index.ts`)해서 해결. Engine bundle hosting
  파이프라인(TreeView 우클릭 → Open as App → Browser 탭에서 실행) 완성.

- [ ] **HTML fullscreen QA** (2026-08-28, 다음 라이브 검증 대상) — itch.io
  데스크톱 클라이언트(`ref-proj/itch`, MIT) 참고해서 추가: Godot Web export가
  자체 fullscreen 버튼 누르면(브라우저 Fullscreen API) Electron이 자동으로 실제
  OS 창을 fullscreen시키는데, 우리 앱 자체 chrome(titlebar, Browser pane
  nav바)이 안 없어져서 몰입감이 깨지던 문제를 고침 — `enter-html-full-screen`/
  `leave-html-full-screen` 이벤트를 감지해서 그때만 chrome 숨김. `godot-demo-web`
  을 "Open as App"으로 연 다음, Godot 캔버스 안의 fullscreen 버튼 눌러서
  titlebar/nav바가 사라지는지, 다시 나가면 복원되는지 확인 필요.

- [ ] Video/Audio QA — File Viewer의 비디오/오디오 재생(`739766b`, `7ec31be`) 실제 GUI 테스트 필요. 특히: 시킹이 진짜 Range 요청(206)으로 되는지 devtools Network 탭에서 확인, 대용량 파일 열 때 메인 프로세스 안 멈추는지, 자막(.srt) 로드+오프셋 조정 동작, 패키지 빌드(`npm run build:mac`)에서 `protocol.handle` 등록이 dev 모드와 동일하게 동작하는지.
- [ ] EPUB QA — `0633f6c` 미니멀 v1 (unzip + spine 순차 iframe, prev/next만). 테스트 파일(Project Gutenberg 앨리스) 전달함 — 워크스페이스 root 안에 넣고 열어서: 챕터 이동, 이미지/CSS가 iframe 안에서 상대경로로 잘 로드되는지, sandbox="allow-same-origin"이라 스크립트는 실행 안 되는 게 맞는지, 이상한 OPF/manifest 형태의 다른 epub에서도 안 깨지는지.
- [ ] **terminal 이중 스크롤 + 글자 깨짐(???) QA** (2026-08-28, 다음 라이브 검증 대상) —
  원인: 어제(`67510fd`) 재도입한 tmux 래퍼. tmux는 화면을 diff-redraw하는
  자체 가상 터미널이라, Claude Code CLI처럼 in-place로 뷰포트를 다시 그리는
  TUI를 감싸면 xterm.js 쪽 스크롤백에 중복/깨진 내용이 쌓이고(이중 스크롤,
  "이전 내용을 못봄") resize 때 wide/유니코드 글자가 "???"로 깨짐 — Orca가
  애초에 tmux 안 쓰는 이유(`.cursor/skills/workspace-ref-port/SKILL.md`
  DON'T: "tmux 래퍼 재도입 금지")와 정확히 일치. `pty.ts`를 tmux 이전
  direct login-shell spawn으로 되돌림(`workspace.ts`의 tmuxSessionName
  플러밍도 제거), 앱 완전 재시작 후 필요: 1) Claude Code(또는 다른 TUI)
  실행 중 스크롤이 정상인지, 2) 유니코드/이모지/박스문자가 안 깨지는지
  확인. 트레이드오프: 앱 완전 종료 후 재실행 시 터미널 세션이 더 이상
  살아남지 않음(quit/relaunch 지속성 상실, 앱 실행 중 재연결은
  PtySession replay buffer로 그대로 유지) — Orca 자체 아키텍처와 동일한
  선택. 재시작 전까지 남아있던 tmux 세션(`workspace-term-dev-43`,
  `workspace-term-dev-45`)은 새 코드로는 더 안 쓰이니 원하면
  `tmux kill-session -t <name>`으로 정리 가능(안 지워도 무해, 그냥 안 씀).
- [ ] 코드 퀄리티 리뷰 이제는 좀 해야제
- [x] 브라우저 URL 입력창 자동완성 (히스토리 기반 드롭다운은 있었는데 "google"처럼 히스토리에 없는 bare word 입력 시 .com 힌트가 없었음 — browserAddressBarSuggestions.ts에 도메인 추측 휴리스틱 추가) - 제대로 구현 필요. 다른 서비스는 어떻게 처리하는지 orca browser, firefox 등 오픈소스 clone해서 참고

미래/아이디어:
- [ ] 3D Viewer? workspace에 blender를 넣어볼까...?
- [ ] 그냥 Linux based 자체 OS로 만들어볼까
- [ ] 모바일 앱 (iOS, Android - iOS first) 또는 브라우저 - 군대 및 편의용.
    - 군대에서 쓰려면 Virtual Private Network and On Premise Infrastructure 필요할 듯.
- [ ] Database Studio
    - Connections
    - Schema
    - Tables
    - Query
    - Result
    - ER Diagram
    - Query History
- [ ] Network Packet Tracker

문제: 지금은 툴 껍데기만 있음
크롤링 / 콘텐츠 / 데이터 시트 / 핀터레스트 / 유튜브
여러 데이터 소스 수집과 DB에 대한 기획 필요
ex.
- 하드웨어 데이터시트. 스펙
- API
- ...

식량
날씨
지역정보

프로젝트아이디어:
- 농장 설계 및 운영 시뮬레이트
- 요리 설계 및 운영 시뮬레이트








