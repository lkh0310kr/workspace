- [ ] Video/Audio QA — File Viewer의 비디오/오디오 재생(`739766b`, `7ec31be`) 실제 GUI 테스트 필요. 특히: 시킹이 진짜 Range 요청(206)으로 되는지 devtools Network 탭에서 확인, 대용량 파일 열 때 메인 프로세스 안 멈추는지, 자막(.srt) 로드+오프셋 조정 동작, 패키지 빌드(`npm run build:mac`)에서 `protocol.handle` 등록이 dev 모드와 동일하게 동작하는지.
- [ ] EPUB QA — `0633f6c` 미니멀 v1 (unzip + spine 순차 iframe, prev/next만). 테스트 파일(Project Gutenberg 앨리스) 전달함 — 워크스페이스 root 안에 넣고 열어서: 챕터 이동, 이미지/CSS가 iframe 안에서 상대경로로 잘 로드되는지, sandbox="allow-same-origin"이라 스크립트는 실행 안 되는 게 맞는지, 이상한 OPF/manifest 형태의 다른 epub에서도 안 깨지는지.

- [x] Cmd + 1, Cmd + 2 - 스타크래프트 처럼 워크스페이스 전환할 수 있도록 (`f1d9d6e`)
- [x] 지금 이 프로젝트 레포 public으로 공개해도 상관없는지 깃 커밋 로그 조사 — 시크릿/개인정보 없음 확인, public 전환 완료
- [x] Markdown Editor editting 부분이 아닌 아래 영역 클릭 시 액션 구현 (`f20f6cd`)
- [x] Pane List (Tabs) Horizontal Scroll bar hover시 거대한 bar가 나오는 버그
- [ ] 3D Viewer? workspace에 blender를 넣어볼까...?
- [ ] 그냥 Linux based 자체 OS로 만들어볼까
