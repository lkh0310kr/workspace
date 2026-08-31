다음 방향 (2026-08-28 최종): Phase 2는 그래픽/설계/CAD급 pane(Figma/Illustrator/
Photoshop급 2D, Blender급 3D, Video Editor, CAD/Omniverse식/Game Engine) — 직접
구현 아니고 실제 오픈소스 엔진을 fork/embed. 첫 타깃 **Game Engine(Godot)**,
Web export를 webview로 host하는 방식 확정. 근거/배경: [docs/ideation.md](docs/ideation.md),
[docs/ROADMAP.md](docs/ROADMAP.md) Phase 1/2. 엔지니어링/분석 pane 목록(Database Studio 등)은 보류(삭제 아님).

**최우선 원칙(기억)**: 안정화/검증 우선 — foundation 조각 하나 만들면 다음 걸로
넘어가기 전에 그게 실제로 작동하는지 검증부터.

## 라이브 QA (미완)

- [ ] **Godot "Export Godot (Web) & Open" 라이브 QA** — TreeView에서
  `test-fixtures/godot-demo` 우클릭 → 메뉴 노출·export·Browser 탭 동작·
  project.godot 없는 폴더에서 메뉴 숨김 확인.
- [ ] **HTML fullscreen QA** — Godot Web export fullscreen 시 titlebar/nav
  숨김·복원 확인.
- [ ] **Video/Audio QA** — File Viewer 재생, Range 206 시킹, 대용량, 자막,
  패키지 빌드 protocol 등록.
- [ ] **EPUB QA** — spine/iframe/상대경로/sandbox, 다양한 epub 형태.
- [ ] **terminal 이중 스크롤 + 글자 깨짐 QA** — tmux 제거 후 TUI/유니코드 확인.
- [ ] **terminal 스크롤 반응 느림/큐잉 QA** — drainQueues 일괄 flush 후 체감 확인.
- [ ] **Interaction 또 끊김 리포트** — 재발 시 콘솔 에러 캡처.

## 제품 / 품질

- [ ] 코드 퀄리티 리뷰
- [ ] 브라우저 URL 자동완성 — bare word `.com` 힌트 1차만 있음; Orca/Firefox
  수준으로 제대로 구현 필요

## Japanese Pane (일본어 공부 패널)

> 상세 리서치: [docs/japanese-pane-research.md](docs/japanese-pane-research.md)

**목표 기능:** 손글씨 한자 찾기 · 획순 애니메이션 · 히라가나/뜻/한국어 뜻 · 예문·액센트 등

**데이터 전략 (요약):** JMdict(`ent_seq`) + KANJIDIC2 + KanjiVG + KRDICT + Tatoeba;
Lexeme 허브 그래프 모델; 소스별 natural key + field provenance로 멀티 소스 upsert.

- [x] **Phase A** — JMdict/KANJIDIC → SQLite + FTS, KanjiVG 획순 뷰, pane 검색 UI
- [x] **Phase B** — KRDICT 한국어 뜻 crosswalk, Tatoeba 예문
- [x] **Phase C** — 손글씨 캔버스 + KanjiVG 매칭 인식 → 한자 후보 → 사전 (Zinnia/ONNX는 후속)
- [x] **Phase D** — SRS, pitch accent, 필기 연습 채점
- [x] **Phase E** — JMdict 품사 표시, SRS due 배지, 한국어 탭 라벨, DB 연결 안정화
- [x] **Phase F** — Tatoeba 전체 import + JMdict 자동 예문 연결, 로마자 검색
- [x] **Phase G** — Kanjium 성조, 일본어 패널 UI/UX (한국어, 키보드 검색, 성조 표시)
- [x] import 파이프라인 스크립트 + 라이선스 NOTICE 번들

## 미래/아이디어

- [ ] 3D Viewer? workspace에 blender를 넣어볼까...?
- [ ] 그냥 Linux based 자체 OS로 만들어볼까
- [ ] 모바일 앱 (iOS, Android - iOS first) 또는 브라우저 - 군대 및 편의용.
    - 군대에서 쓰려면 Virtual Private Network and On Premise Infrastructure 필요할 듯.
- [ ] Database Studio
    - Connections / Schema / Tables / Query / Result / ER Diagram / Query History
- [ ] Network Packet Tracker

문제: 지금은 툴 껍데기만 있음
크롤링 / 콘텐츠 / 데이터 시트 / 핀터레스트 / 유튜브
여러 데이터 소스 수집과 DB에 대한 기획 필요
ex.
- 하드웨어 데이터시트. 스펙
- API
- ...

식량 / 날씨 / 지역정보

프로젝트아이디어:
- 농장 설계 및 운영 시뮬레이트
- 요리 설계 및 운영 시뮬레이트

---

# PKMS 옵시디언 모바일 연동 방법

진짜 계속 생각하는건데…
모바일 앱 클라이언트를 하나 만들어야할 거 같음.
그럼 서빙하는 중앙 서버가 있어야하는데
그건 NAS가 되겠지.
아니면 AWS에 PKMS호스팅 서버를 올리고 깃헙액션 같은걸로 릴리즈 계속 올리면소 백업해도되고.
스토리지 서비스는 뭘쓰지.. sftp가 그냥 가장 단순하고 좋을 거 같은데. 모바일 클라이언트랑 기술적으로 연동이 잘 되려나.
실시간성도 노션급 ui ux로 가능하려나

TITLE:
Personal Cloud File System — Multi-client Real-time Synchronization Architecture
HTTP API / WebSocket / WebDAV / Git / NAS / AWS

이미 구현된 검증된 오픈소스는 없는가?
NextCloud

모바일 클라이언트 연동은? 내가 클라이언트 앱을 하나 만들어서 넥스트클라우드 백엔드랑 붙일 수 있는가?
가능. Api 적극 제공

넥스트클라우드가 셀프호스팅이라 보안 설정은 알아서 해야하지? 그냥 아이디 비번 수준으로만 제공해줄 거 같은데
아래 서비스 제공
로그인/토큰 인증
Brute-force 방어가 기본 활성화
HTTPS 지원
보안 헤더
2FA 등 추가 인증
세션/권한 관리

아래는 직접 챙겨야 함
HTTPS
방화벽
reverse proxy 설정
2FA
관리자 계정 보호
NAS 자체 보안
백업

---

# 3D

공장 농장 자연 기계 등을 배우자할때
현실적으로 그게 힘들기 때문에
시뮬레이트하자고 생각terminal-9d5c04df-5821-4281-b904-f170097fe49a

블렌더를 배워보자 생각했지만 컴퓨터 사양이 안돼서 x
기획. 시스템 설계. 이 방향으로 가는 게 맞는 거 같음.

환경과 요소. 그 간의 관계 및 조건 설정.
해와 달. 산과 바다. 땅과 하늘. 구성

그게 자꾸 예술 방향으로 가니깐 3d modeling, drawing쪽으로 가는 것..

주요 목표는 시뮬레이트하여 공부하는 것.
사실 시각화하지 않아도 글로 표현 가능.

공예법 제조법 요리법

제조쪽 쇼츠 유튜버

제조의 분과와 공통 요소
요리 도구

음 너무 추상적으로 가면 걍 암것도 못할 거 같은데 시간만 버리고

PKMS에 좀 더 방법들을 정리해보자.
나중에 자급자족 시골라이프를 하게 되었을때 도움이 될지도 모르니깐. 닥터스톤이야.


---

- [x] Markdown Editor Option으로 다중선택 등 기능 추가
- [x] Cmd + Shift + V 로 format 없이 붙여넣기
- [x] Markdown Editor outline, find button 클릭시 popover형태로 목차가 뜨도록 (outline의 경우 스크롤 포함)
- [x] TreeView를 Workspace전체에 종속되게 하지말고 Tabs에 즉, 한 레이아웃에만 종속되도록. 레이아웃 안의 여러 Pane들이 같이 쓸 수 있게. (이미 WorkspaceLayoutHost에서 tab.id 단위로 되어있었음 — 확인만)
- [x] Sidebar button (select workspace) 삭제하고 워크스페이스 탭처럼 선택할 수 있도록 하자. Cmd + N 단축키는 그대로 두고 (버튼 삭제는 7a27630에서 이미 완료, Cmd+N만 추가로 구현)


