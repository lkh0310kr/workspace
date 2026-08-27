- [ ] Video/Audio QA — File Viewer의 비디오/오디오 재생(`739766b`, `7ec31be`) 실제 GUI 테스트 필요. 특히: 시킹이 진짜 Range 요청(206)으로 되는지 devtools Network 탭에서 확인, 대용량 파일 열 때 메인 프로세스 안 멈추는지, 자막(.srt) 로드+오프셋 조정 동작, 패키지 빌드(`npm run build:mac`)에서 `protocol.handle` 등록이 dev 모드와 동일하게 동작하는지.
- [ ] EPUB QA — `0633f6c` 미니멀 v1 (unzip + spine 순차 iframe, prev/next만). 테스트 파일(Project Gutenberg 앨리스) 전달함 — 워크스페이스 root 안에 넣고 열어서: 챕터 이동, 이미지/CSS가 iframe 안에서 상대경로로 잘 로드되는지, sandbox="allow-same-origin"이라 스크립트는 실행 안 되는 게 맞는지, 이상한 OPF/manifest 형태의 다른 epub에서도 안 깨지는지.
- [ ] Vector Editor M1 QA — 새 패널 "Vector"로 탭 생성 → 사각형/타원 그리기, 클릭 선택, 드래그 이동/리사이즈(8핸들)/회전, 저장(⌘S, `.vec.json`)·재오픈 라운드트립, TreeView에서 `.vec.json` 더블클릭 시 Vector 패널로 열리는지. geometry(회전 상태 리사이즈 등)는 vitest로 검증했지만 실제 마우스 인터랙션은 GUI에서 확인 필요.

- [ ] TreeView 파일이 아닌 영역 우클릭 가능하도록 - ex. 파일,폴더 추가
- [x] Pane List (Tabs) Horizontal Scroll bar hover시 거대한 bar가 나오는 버그
- [ ] terminal - Claude Code에서 불안정함. 이전 내용을 못봄 - 이중 스크롤 문제인듯. 뭔가 높이가 잘못 설정되어서  상위 스크롤만 인식을 하는 듯.
- [ ] 코드 퀄리티 리뷰 이제는 좀 해야제

미래/아이디어:
- [ ] 3D Viewer? workspace에 blender를 넣어볼까...?
- [ ] 그냥 Linux based 자체 OS로 만들어볼까
- [ ] 모바일 앱 (iOS, Android - iOS first) 또는 브라우저
- [ ] 