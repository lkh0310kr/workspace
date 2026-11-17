# Editor TreeView

Desktop Editor는 공유 `packages/editor`의 `@workspace/editor/tree` 기능 slice를 사용한다. tree UI·상태·탐색 규칙·스타일은 `packages/editor/src/tree/`에서 소유한다. Desktop Editor adapter는 로컬 provider를 연결하고 filesystem mutation, workspace selection과 pane 상태를 소유한다.

## 책임 경계

- `EditorTreePane`은 header/footer slot, pane layout, scroll owner를 제공한다.
- `EditorTreeView`는 visible rows, keyboard focus, selection, virtualized rendering을 담당한다.
- `EditorTreeRow`는 disclosure, filename, inline create/rename과 row-level actions를 표시한다.
- `EditorSidebar`는 local provider, width preference, root selection과 Editor tree 상태를 연결한다.

공통 구현은 [Editor package](../../README.md), provider 동작은 [Desktop local provider](../../workspace/editor/providers.md), pane 동작은 [Workspace layout](../../workspace/layout/README.md)이 기준이다.

## 사용자 결과

- 폴더를 확장·접고 키보드 focus와 선택 행을 일관되게 이동한다.
- 가상 목록의 focus 이동은 행을 viewport에 표시하고 scroll 위치를 복원한다.
- 파일 이름 변경·생성은 row 안에서 입력하며 Enter로 완료하고 Escape로 취소한다.
- 파일 이동과 폴더 생성은 local provider의 검증된 경로를 사용한다.
- 숨김 파일과 `.gitignore` 판정은 서로 다른 상태로 표시한다. 무시 파일도 Editor tree에서 탐색하고 열 수 있다.
- 숨길 파일·폴더는 Editor pane에 focus한 뒤 `Cmd+,`로 연 설정창의 파일 및 폴더 메뉴에서 여러 줄 입력란에 한 줄씩 이름 또는 `*` 패턴을 적어 지정한다. workspace별 `.workspace/settings.json`의 `editor.hiddenFiles`에 저장한다. 기본 목록은 비어 있어 모든 파일과 폴더를 표시한다. 목록의 항목만 TreeView에서 숨기며 `.gitignore` 항목과 빠른 열기·파일 내용 검색에는 영향을 주지 않는다. 같은 메뉴의 Markdown 확장자 숨기기는 기본 꺼짐이며, 켜면 TreeView에서 `.md`와 `.markdown` 확장자를 감춘다.
- Markdown 확장자 표시 설정은 TreeView에만 적용하며 문서 본문 제목 규칙과 분리한다.
- 파일·폴더의 context menu에서 `Pin`을 선택하면 같은 폴더 목록의 위쪽에 표시하고 이름 옆에 핀 아이콘을 붙인다. `Unpin`을 선택하면 기본 이름순 위치로 돌아간다. 고정 경로만 workspace별 `.workspace/settings.json`의 `editor.pinnedPaths`에 저장한다. 이름 변경과 이동은 고정 경로를 새 경로로 갱신하고, 삭제는 해당 경로와 하위 경로를 정리한다.

## 수락 시나리오

| ID      | 입력/행동                                               | 기대 결과                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TREE-01 | 폴더 확장과 접기를 반복                                 | visible rows와 disclosure state가 일치한다.                                                                                                                                                                              |
| TREE-02 | 키보드로 목록 밖 행으로 이동                            | focus 행이 viewport 안으로 이동한다.                                                                                                                                                                                     |
| TREE-03 | 선택 파일 변경 후 다른 pane을 갔다 돌아옴               | focus·선택·scroll 상태가 해당 workspace에 맞게 복원된다.                                                                                                                                                                 |
| TREE-04 | 새 파일/폴더 생성 후 Escape 또는 Enter                  | Escape는 입력을 취소하고 Enter는 filesystem에 반영한다.                                                                                                                                                                  |
| TREE-05 | 파일 rename 또는 move                                   | 실제 filesystem 변경 뒤 tree path와 열린 문서 identity가 갱신된다.                                                                                                                                                       |
| TREE-06 | `.gitignore` 대상과 무시되지 않는 항목 표시             | 무시 여부만 muted style로 구분하고 탐색 기능은 유지한다.                                                                                                                                                                 |
| TREE-07 | Editor 설정에서 파일 필터와 Markdown 확장자 표시를 관리 | 모든 파일과 폴더를 기본 표시하고, 사용자가 지정한 패턴만 TreeView에서 숨긴다. Markdown 확장자 표시는 설정에 따라 바뀌며 다른 목록과 검색은 변하지 않는다. 설정은 해당 workspace의 `.workspace/settings.json`에 저장된다. |
| TREE-08 | 파일·폴더 context menu에서 `Pin` 또는 `Unpin` 선택      | 고정 항목은 같은 폴더 목록 위쪽에 아이콘과 함께 표시되고 재시작 후에도 유지된다. 이름 변경·이동은 고정 경로를 갱신하고 삭제는 해당 경로와 하위 경로를 제거한다.                                                          |

근거는 `TreeView.test.ts`, `editorTreeProjection.test.ts`, `editorTreeReload.test.ts`, `TreeView.scroll.test.ts`, `EditorSidebar.shortcut.test.ts`와 `scripts/check-editor-tree-contract.mjs`다. 실제 Electron drag/drop과 OS별 focus 동작은 별도 수동 확인 대상이다.
