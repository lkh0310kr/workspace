다음 방향: Creative pane(Vector Editor 등)은 접고 엔지니어링/분석 계열 pane으로 전환하기로 함
— 후보 목록과 배경은 [docs/ideation.md](docs/ideation.md) 참고 (Database Studio, Network/Packet
Analyzer, Serial/Embedded Studio, Hex/Binary Inspector, GIS, Robot Simulator 등). 아직 어느 것부터
할지 미확정 — 다음 세션에서 우선순위 정하고 착수.

- [ ] Video/Audio QA — File Viewer의 비디오/오디오 재생(`739766b`, `7ec31be`) 실제 GUI 테스트 필요. 특히: 시킹이 진짜 Range 요청(206)으로 되는지 devtools Network 탭에서 확인, 대용량 파일 열 때 메인 프로세스 안 멈추는지, 자막(.srt) 로드+오프셋 조정 동작, 패키지 빌드(`npm run build:mac`)에서 `protocol.handle` 등록이 dev 모드와 동일하게 동작하는지.
- [ ] EPUB QA — `0633f6c` 미니멀 v1 (unzip + spine 순차 iframe, prev/next만). 테스트 파일(Project Gutenberg 앨리스) 전달함 — 워크스페이스 root 안에 넣고 열어서: 챕터 이동, 이미지/CSS가 iframe 안에서 상대경로로 잘 로드되는지, sandbox="allow-same-origin"이라 스크립트는 실행 안 되는 게 맞는지, 이상한 OPF/manifest 형태의 다른 epub에서도 안 깨지는지.
- [x] TreeView 파일이 아닌 영역 우클릭 가능하도록 - ex. 파일,폴더 추가 (핸들러 자체는 있었는데 `.tree-view`가 파일 목록 높이만큼만 있어서 짧은 폴더의 빈 공간은 클릭이 안 먹혔음 — `min-height: 100%` 추가해서 수정)
- [x] Pane List (Tabs) Horizontal Scroll bar hover시 거대한 bar가 나오는 버그
- [ ] terminal - Claude Code에서 불안정함. 이전 내용을 못봄 - 이중 스크롤 문제인듯. 뭔가 높이가 잘못 설정되어서  상위 스크롤만 인식을 하는 듯.
- [ ] 코드 퀄리티 리뷰 이제는 좀 해야제
- [x] 브라우저 URL 입력창 자동완성 (히스토리 기반 드롭다운은 있었는데 "google"처럼 히스토리에 없는 bare word 입력 시 .com 힌트가 없었음 — browserAddressBarSuggestions.ts에 도메인 추측 휴리스틱 추가)

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
