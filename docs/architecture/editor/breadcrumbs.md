# Editor Breadcrumb 스펙

`EditorBreadcrumbs`는 편집 중인 파일의 workspace 기준 경로를 편집 영역 위에 표시한다. 앱 호스트는 파일 경로, 디렉터리 목록 조회와 파일 열기 callback을 제공한다. 공유 컴포넌트는 경로 이름, 경로별 메뉴, 키보드 닫기와 형제 파일 선택을 처리한다.

## 사용자에게 보이는 결과

- 파일을 편집할 때 `Workspace` 루트와 비어 있지 않은 경로 구성 요소를 차례로 표시한다.
- 경로가 없는 새 문서(`path === null`)에는 경로 표시줄을 표시하지 않는다.
- 경로 요소가 길면 화면에 맞춰 줄이고 접근성 이름에는 전체 경로를 보존한다. 표시할 공간이 부족하면 메뉴가 가려지지 않도록 경로 줄을 가로로 스크롤한다.
- 경로 요소를 누르면 해당 요소의 부모 디렉터리 안에 있는 형제 항목 메뉴를 연다. 파일을 선택하면 호스트의 파일 열기 경로에 파일 종류(code, Markdown, viewer)를 전달한다.
- 디렉터리를 선택하면 같은 메뉴에서 해당 디렉터리의 하위 항목을 보여준다. Escape는 메뉴를 닫고, 현재 경로가 바뀌어도 메뉴를 닫는다.
- 이 표시줄은 경로만 보여준다. 문서 목차나 구조 제어는 제공하지 않는다. 언어 심볼 경로는 심볼 provider가 추가되기 전까지 이 계약에 포함하지 않는다.

## 소유권과 API

`packages/editor/src/EditorBreadcrumbs.tsx`는 `EditorBreadcrumbs`, `EditorBreadcrumbEntry`, `EditorBreadcrumbsProps`를 패키지 진입점에서 내보낸다. `path`는 provider 기준 상대 경로다. `onLoadChildren(directoryPath)`는 `name`, `path`, `kind`를 가진 항목을 반환한다. `directory` 항목은 하위 목록을 탐색할 수 있고, 파일 종류는 `code`, `markdown`, `viewer`다. `onOpenFile(path, kind)`는 실제 열기 처리를 호스트에 맡긴다.

Desktop 호스트는 `EditorProvider`로 부모 디렉터리를 조회하고 하위 항목을 나열한다. provider의 `asset` 종류는 breadcrumb의 `viewer`로 변환한다. 공유 컴포넌트는 파일시스템, Electron API 또는 provider 구현을 직접 가져오지 않는다.

## 재생성 시나리오

| ID | 입력/행동 | 기대 결과 |
| --- | --- | --- |
| BREADCRUMB-01 | `notes/ideas/today.md`를 연다 | Workspace, notes, ideas, today.md를 순서대로 표시한다. |
| BREADCRUMB-02 | 경로가 없는 Markdown 문서를 연다 | 경로 표시줄을 표시하지 않는다. |
| BREADCRUMB-03 | `ideas`를 선택한다 | `notes`의 형제 항목 메뉴를 열고 현재 항목을 구분한다. |
| BREADCRUMB-04 | 경로 메뉴에서 다른 파일을 선택한다 | 호스트가 해당 파일 종류로 열고, 경로를 갱신한 뒤 메뉴를 닫는다. |
| BREADCRUMB-05 | 메뉴에서 디렉터리를 선택한 뒤 Escape를 누른다 | 같은 메뉴에 디렉터리 하위 항목을 표시하고 Escape로 닫는다. |
| BREADCRUMB-06 | 키보드로 경로 요소를 선택한다 | 메뉴에 포커스를 옮기고 위/아래/Home/End로 항목을 이동한다. Escape는 메뉴를 닫고 경로 요소에 포커스를 돌려준다. 바깥 클릭도 메뉴를 닫는다. |
| BREADCRUMB-07 | 좁은 편집 영역에서 깊게 중첩된 파일을 연다 | 한 줄을 유지하며 가로 스크롤할 수 있고, 경로 메뉴는 편집 영역 위에 표시된다. |

현재 스타일은 `packages/editor/src/tree.css`, Desktop 배치는 `apps/workspace-app/src/renderer/src/panes/EditorContent.tsx`에 있다.
