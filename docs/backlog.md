# Workspace app backlog

- Terminal Pane
    - [x] 스크롤 문제(갑자기 스크롤이 끊겨서 안됨), 화면 깨짐 문제(물음표로 나오거나 그냥 막 글자가 밀려서 나옴) 좀 고쳐봐. Codex CLI, Claude Code같은거 쓸때 자주 발생함. Orca랑 똑같이 만들면 이런 버그 안 생기는데.
    - [x] White Color Scroll Bar Container Left Border 1px 있는거 없애.
    - [x] Scroll Bar안보임 Codex CLI에서
- Editor
    - [ ] UI/UX 전체 점검 및 수정
        - [x] Ctrl+S가 split editor 전체가 아니라 포커스된 문서만 저장하도록 수정
        - [x] 비동기 저장 경합으로 최신 문서를 덮거나 Unsaved 상태를 잃는 문제 수정
        - [x] TreeView 파일 작업 실패 후 pane 경로/선택 상태가 잘못 갱신되는 문제 수정
        - [x] 미저장 Markdown 문서 제목 변경 시 편집 내용 보존 및 autosave 경합 수정
    - TreeView
    - Content Editing
- [ ] docs 정리좀 하자. 일단 한국어로 좀 변환하고. 구조적으로 파일 폴더 정리해줘. 필요없는거같은 내용 나한테 삭제할지 말지 보고하고 최소한의 폴더 구조로 간단하게 문서화하는거야 알겠지?
