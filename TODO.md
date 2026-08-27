다음 작업 (순서대로):
1. **Vector Editor 라이브 QA** — 아래 "Vector Editor QA (M1-M6 전체)" 항목을 직접 GUI에서 돌려보고 버그/불편한 점 알려주기. 이게 끝나야 다음 단계로 넘어감 (한 페인을 완전히 완성하고 나서 다음 페인/기능으로 — 세션 내내 지킨 원칙).
2. QA에서 나온 버그 수정.
3. QA 통과하면 그 다음은 둘 중 하나 (아직 미확정, 그때 다시 정하기):
   - `docs/architecture/10-creative-panes-ux-roadmap.md`의 Tier 2(정렬/분배, 스냅, boolean 연산, 레이어 패널, 룰러/가이드 등)부터 순서대로 Vector Editor UX 개선 — Tier 1(pan/zoom, marquee, z-order, flip)은 이미 M6로 구현 완료
   - Pixel Art pane 설계 문서 작성 후 M1부터 착수 (같은 TODO.md의 "Pixel Art pane" 섹션 참고)

- [ ] Video/Audio QA — File Viewer의 비디오/오디오 재생(`739766b`, `7ec31be`) 실제 GUI 테스트 필요. 특히: 시킹이 진짜 Range 요청(206)으로 되는지 devtools Network 탭에서 확인, 대용량 파일 열 때 메인 프로세스 안 멈추는지, 자막(.srt) 로드+오프셋 조정 동작, 패키지 빌드(`npm run build:mac`)에서 `protocol.handle` 등록이 dev 모드와 동일하게 동작하는지.
- [ ] EPUB QA — `0633f6c` 미니멀 v1 (unzip + spine 순차 iframe, prev/next만). 테스트 파일(Project Gutenberg 앨리스) 전달함 — 워크스페이스 root 안에 넣고 열어서: 챕터 이동, 이미지/CSS가 iframe 안에서 상대경로로 잘 로드되는지, sandbox="allow-same-origin"이라 스크립트는 실행 안 되는 게 맞는지, 이상한 OPF/manifest 형태의 다른 epub에서도 안 깨지는지.
- [ ] Vector Editor QA (M1-M6 전체) — 새 패널 "Vector"로 탭 생성 →
  - M1: 사각형/타원 그리기, 클릭 선택, 드래그 이동/리사이즈(8핸들)/회전, 저장(⌘S, `.vec.json`)·재오픈 라운드트립, TreeView에서 `.vec.json` 더블클릭 시 Vector 패널로 열리는지.
  - M2: 펜 툴로 anchor 클릭/드래그(핸들) 곡선, Enter/첫 anchor 클릭으로 경로 닫기·완성, 라인 툴.
  - M3: 인스펙터 fill/stroke/width/opacity 편집, 다중 선택 후 ⌘G 그룹, ⌘⇧G 언그룹(위치 안 튀는지).
  - M4: ⌘Z/⌘⇧Z undo/redo (제스처 단위로 쌓이는지 — 드래그 하나당 히스토리 1개), Export SVG/PNG 버튼(실제 파일 열어서 내용 확인), ⌘D 복제, ⌘C/⌘V 복사-붙여넣기, Backspace/Delete 삭제, 방향키/Shift+방향키 nudge.
  - M5: 텍스트 툴로 클릭 → 배치, 인스펙터의 Text/Size 필드로 내용·폰트크기 편집, 이동/회전은 되고 리사이즈 핸들은 없는 게 맞는지.
  - M6: Space+드래그(또는 휠 클릭 드래그)로 팬, 휠로 팬, ⌘+휠/트랙패드 핀치로 커서 위치 기준 줌, 툴바 −/%/+/⤢ 버튼, 0=리셋 2=선택에 맞춤 단축키, 빈 캔버스 드래그로 marquee 다중선택(Shift로 추가, 클릭만 하면 선택 해제), 툴바 z-order 4버튼(⇤←→⇥)과 [/]/{/} 단축키, flip H/V 버튼과 Shift+H/V 단축키.
  - geometry(회전 상태 리사이즈 등)는 vitest로 검증했지만 실제 마우스 인터랙션은 GUI에서 확인 필요.

- [ ] TreeView 파일이 아닌 영역 우클릭 가능하도록 - ex. 파일,폴더 추가
- [x] Pane List (Tabs) Horizontal Scroll bar hover시 거대한 bar가 나오는 버그
- [ ] terminal - Claude Code에서 불안정함. 이전 내용을 못봄 - 이중 스크롤 문제인듯. 뭔가 높이가 잘못 설정되어서  상위 스크롤만 인식을 하는 듯.
- [ ] 코드 퀄리티 리뷰 이제는 좀 해야제
- [ ] 브라우저 URL 입력창 자동완성

Vector/Pixel Art UX 백로그 (Penpot 클론 기반 정리 — 자세한 배경/우선순위는 [docs/architecture/10-creative-panes-ux-roadmap.md](docs/architecture/10-creative-panes-ux-roadmap.md) 참고):

Tier 1 — 설계 문서에 이미 있었는데 실제로는 안 만들어진 것들 (뷰포트/줌 등):
- [x] Vector: 뷰포트 pan (spacebar+drag)
- [x] Vector: 뷰포트 zoom (wheel/트랙패드 핀치)
- [x] Vector: 줌 리셋 버튼/단축키
- [x] Vector: 줌-투-핏(전체 보기) 버튼
- [x] Vector: 줌-투-셀렉션(선택 영역에 맞춤) 버튼
- [x] Vector: 현재 줌 배율 표시 (예: 100%)
- [x] Vector: 줌 상태를 어디에 둘지 결정 (문서에 저장 vs 세션 로컬)
- [x] Vector: 빈 캔버스 드래그 시 marquee(고무줄) 선택 사각형
- [x] Vector: marquee와 교차하는 오브젝트 전부 다중 선택
- [x] Vector: Shift+marquee로 기존 선택에 추가
- [x] Vector: marquee가 그룹 내부까지 뚫고 들어가지 않고 그룹 전체를 선택하는지 (기존 클릭 규칙과 일관성)
- [x] Vector: Bring to Front 액션+단축키
- [x] Vector: Bring Forward 액션+단축키
- [x] Vector: Send Backward 액션+단축키
- [x] Vector: Send to Back 액션+단축키
- [x] Vector: Flip Horizontal 액션+단축키
- [x] Vector: Flip Vertical 액션+단축키

Tier 2 — Penpot에서 확인한 전문 에디터급 편의기능 (새 스코프):
- [ ] Vector: Align Left/Right/Top/Bottom
- [ ] Vector: Align Horizontal/Vertical Center
- [ ] Vector: Distribute Horizontally (균등 간격)
- [ ] Vector: Distribute Vertically (균등 간격)
- [ ] Vector: 드래그 중 다른 오브젝트 edge/center에 스냅
- [ ] Vector: 스냅 중 가이드라인 렌더링
- [ ] Vector: 스냅 on/off 토글 단축키
- [ ] Vector: 스냅 threshold 조정 가능하게
- [ ] Vector: 오브젝트 많을 때 스냅 스캔 성능 확인 (필요시 최적화)
- [ ] Vector: Boolean Union
- [ ] Vector: Boolean Subtract (difference)
- [ ] Vector: Boolean Intersect
- [ ] Vector: Boolean Exclude
- [ ] Vector: Boolean 결과 PathObject가 재편집(anchor 유지) 가능한지 검증
- [ ] Vector: sceneGraph.ts의 BaseObject에 locked/visible 필드 추가
- [ ] Vector: locked 오브젝트는 선택/드래그 불가
- [ ] Vector: visible=false 오브젝트는 렌더링·hit-test 모두 스킵
- [ ] Vector: 레이어 패널 UI (doc.objects 목록 표시)
- [ ] Vector: 레이어 패널 클릭 시 캔버스 선택과 동기화
- [ ] Vector: 레이어 패널 행별 lock 토글
- [ ] Vector: 레이어 패널 행별 visibility 토글
- [ ] Vector: 캔버스 상단/좌측 ruler 스트립
- [ ] Vector: 룰러에서 드래그해서 가이드 라인 생성
- [ ] Vector: 가이드 라인 표시/숨김 토글
- [ ] Vector: 가이드 라인도 스냅 대상에 포함
- [ ] Vector: 단축키 도움말 모달/패널
- [ ] Vector: 단축키 목록을 TOOL_SHORTCUTS 등 기존 상수에서 자동 생성
- [ ] Vector: 최근 사용 색상 팔레트 스트립
- [ ] Vector: 커스텀 색상 저장(문서별 팔레트)
- [ ] Vector: 팔레트 클릭으로 fill/stroke 빠르게 적용
- [ ] Vector: 팔레트 영속화 방식 결정 (vec.json 내부 vs 별도 설정파일)
- [ ] Vector: Copy Style 액션 (fill/stroke/width/opacity만 복사)
- [ ] Vector: Paste Style 액션

공유 인프라 (Pixel Art 실제로 시작할 때 처리 — 지금은 결정만 기록):
- [ ] Pixel Art 시작 시점에 pan/zoom을 useViewportPanZoom 훅으로 pane-agnostic 추출
- [ ] Pixel Art 시작 시점에 vectorHistory.ts를 제네릭 historyStack.ts로 일반화
- [ ] (섣부른 추상화 방지) 실제 두 번째 사용처 생기기 전엔 위 두 개 미루기로 한 결정 유지

Pixel Art pane (아직 미시작 — Vector 검증 끝난 뒤 착수, 설계만 미리 백로그화):
- [ ] Pixel Art 설계 문서 작성 (08-vector-editor.md 패턴대로 docs/architecture에)
- [ ] 캔버스 렌더링 방식 확정: `<canvas>` 2D + imageSmoothingEnabled=false (SVG-DOM 아님, Vector와 다른 이유 문서화)
- [ ] PixelDocument/PixelLayer 데이터 모델 설계
- [ ] 픽셀 데이터 직렬화 방식: base64 PNG를 JSON에 embed (`.pix.json`)
- [ ] Pencil 툴
- [ ] Eraser 툴
- [ ] Bucket Fill 툴 (flood fill, 4-connected)
- [ ] Eyedropper 툴
- [ ] Line 툴 (Bresenham)
- [ ] Rectangle 툴 (outline + filled)
- [ ] 레이어 지원 (추가/삭제/순서변경/visibility/opacity)
- [ ] Undo/redo (공유 historyStack 모듈 재사용)
- [ ] Export PNG (레이어 합성)
- [ ] 정수 배율 줌 (1x/2x/4x/8x/16x) — 흐림 방지
- [ ] 그리드 오버레이 토글
- [ ] Piskel(MIT) 레퍼런스 클론 검토 — 인터랙션 검증용 (tldraw 했던 것처럼)

Tier 3 — 참고용, 당장 기대 안 함 (Penpot엔 있지만 1인 개인 앱엔 과함):
- [ ] Components/Instances (재사용 심볼 + override)
- [ ] Auto-layout (flex/grid 컨테이너)
- [ ] Design Tokens (네임드 색상/스페이싱 값)
- [ ] 멀티페이지 문서 / 아트보드(Frame) 개념
- [ ] 프로토타이핑 인터랙션 (프레임 간 클릭 흐름) — Presentation 계열 페인으로 분리 검토
- [ ] 코멘트/멀티플레이어 프레즌스 — 명시적 비목표, 기록만

미래/아이디어:
- [ ] 3D Viewer? workspace에 blender를 넣어볼까...?
- [ ] 그냥 Linux based 자체 OS로 만들어볼까
- [ ] 모바일 앱 (iOS, Android - iOS first) 또는 브라우저
- [ ] Database Studio
    - Connections
    - Schema
    - Tables
    - Query
    - Result
    - ER Diagram
    - Query History
- [ ] Network Packet Tracker
