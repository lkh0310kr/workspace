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
