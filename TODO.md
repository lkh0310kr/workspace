# TODO

- [x] `Cmd+,`로 Settings 다이얼로그 표시
- [x] Settings > Appearance에 Theme 설정 (light / dark / system)
- [ ] 터미널 테마 설정 기능 — xterm.js `Terminal`이 `TerminalPane.tsx`에서 하드코딩된 색상(`#0d0d0d` 등)으로 한 번만 초기화되고, 앱 전체 light/dark 전환에도 반응 안 함. 앱 테마를 따라가게 하거나, 별도 터미널 전용 테마 선택지를 Settings에 추가
- [ ] Split panel을 자유롭게 위치 이동할 수 있도록
- [ ] Splitter(separator) 인식 범위 확대 — 현재 1px라 드래그하기 불편함
- [ ] 앱 업데이트/재빌드 후에도 터미널 내용, 내부 Claude 세션 등이 살아있도록 (참고: Orca는 업데이트해도 작업이 계속 진행됨)
- [ ] Markdown 에디터를 Obsidian/Notion 스타일의 진짜 WYSIWYG 단일 뷰로 — 지금처럼 editor/preview 분리 구조 아님
