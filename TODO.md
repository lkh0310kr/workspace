# TODO

- [x] `Cmd+,`로 Settings 다이얼로그 표시
- [x] Settings > Appearance에 Theme 설정 (light / dark / system)
- [ ] Terminal GPU 가속/렌더링 — `crates/terminal-gpu`가 이미 워크스페이스 멤버로 존재하지만 아직 어디에도 연결 안 됨. 실제로 쓰이고 있는지, 아니면 스캐폴딩만 있는 건지 확인 필요
- [x] Terminal/Markdown/Code Editor 패널에 `Cmd+F` 검색 기능
- [x] 앱 켜면 기본적으로 Full Screen 크기로 (maximized) — 지금은 한 80% 정도밖에 안 됨
- [x] 터미널 테마 설정 기능 — 앱 전체 light/dark 테마를 따라가도록 연동 완료
- [x] Split panel을 자유롭게 위치 이동할 수 있도록
- [x] Splitter(separator) 인식 범위 확대 — 현재 1px라 드래그하기 불편함
- [ ] 앱 업데이트/재빌드 후에도 터미널 내용, 내부 Claude 세션 등이 살아있도록 (참고: Orca는 업데이트해도 작업이 계속 진행됨)
- [x] Markdown 에디터를 Obsidian/Notion 스타일의 진짜 WYSIWYG 단일 뷰로 (헤딩/굵게/기울임/인라인코드/링크 — 테이블 등 더 복잡한 요소는 아직)
- [x] App icon 추가 (플레이스홀더 — 실제 디자인으로 나중에 교체 가능)
- [x] Workspace base path — 탭(Tab)별로 독립적으로 설정 가능하도록. "Workspace N" 명칭을 "Tab N"으로 변경, 각 탭 행에 설정(⚙) 버튼 추가
- [x] Markdown 에디터에 TreeView 추가 (파일 탐색 — 탭의 base path 기준)
