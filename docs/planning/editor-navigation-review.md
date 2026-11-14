# Editor 탐색 동작 검토

이 검토는 TreeView의 scroll 취소 문제와 요청된 Breadcrumb을 확인한다. 코드 변경은 있지만 사용자가 TreeView를 다시 열 수 없고 scroll도 여전히 이동한다고 재보고했다. 따라서 scroll 보존과 toggle 동작은 **수정 완료로 승인되지 않았다**. Markdown 렌더링, 제목/폭, reference parity는 [Editor 완성도 스펙](../architecture/editor/markdown/product-completeness.md)에서 관리한다. VS Code와 Zed는 결과를 비교할 기준이며 전체 기능 parity를 목표로 삼지는 않는다.

## 확인 결과

| ID | 발견 사항 | 저장소 근거 | 사용자에게 보이는 영향 | 상태 |
| --- | --- | --- | --- | --- |
| NAV-01 | 이전 anchor 저장 변경으로도 사용자가 보고한 runtime scroll 문제를 해결하지 못했다. | `TreeView.tsx`는 row path/offset을 저장하지만 active path reveal은 `scrollIntoView`도 호출한다. 선택/열기 과정에서 보존되는지 runtime 수락 근거가 없다. | 활성 파일을 바꾸면 scroll이 이동할 수 있다. Viewport 보존과 명시적 reveal 의도를 분리해 보고된 순서로 확인해야 한다. | 미해결 |
| NAV-02 | 활성 파일 동기화가 선택 동기화와 같은 effect에서 reveal한다. | 선택 path effect가 ancestor를 펼치고 row reveal을 예약한다. | 일반적인 tree 선택에서 scroll 보존과 경쟁할 수 있다. Auto-reveal 의도와 일반 선택을 구분해야 한다. | 계약 필요 |
| NAV-03 | Directory 조회에 최신 요청/root guard가 없던 문제가 있었다. | `loadDir`는 branch sequence, workspace root, provider identity를 검사한 뒤 반영한다. | 늦게 도착한 이전 응답이 새 branch 또는 다른 root의 데이터를 덮지 않는다. | 구현됨 |
| NAV-04 | Editor에 파일 경로 Breadcrumb이 없었다. | `EditorBreadcrumbs`를 Desktop `EditorContent`의 code/Markdown 경로에 연결했다. Viewer pane은 아직 연결하지 않았다. | Workspace 기준 경로와 segment 메뉴에서 형제 파일을 확인·열 수 있다. | code/Markdown 구현됨 |
| NAV-05 | Tree 스펙에 scroll anchor와 활성 파일 reveal 결과가 빠져 있었다. | TreeView 스펙에 동작과 TREE-08~TREE-11 재생성 시나리오를 기록하고, Breadcrumb 스펙에 BREADCRUMB-01~06을 기록했다. | 이후 재구현 시 확인할 결과가 명시돼 있다. | 문서화됨 |

## Reference 동작과 제품 결정

| 기능 | VS Code | Zed | 제품에 적용할 결과 |
| --- | --- | --- | --- |
| 경로 Breadcrumb | Editor 위에 파일 경로를 보여주고 segment에서 이동하며 형제 항목을 고를 수 있다. 언어 지원이 있으면 symbol Breadcrumb도 제공한다. | Project path와 syntax context를 Editor 위에 보여준다. | 먼저 파일 경로 Breadcrumb을 정의한다. Symbol Breadcrumb은 실제 symbol provider가 생긴 뒤 추가한다. |
| Project tree의 활성 파일 | Explorer에서 활성 파일의 위치를 reveal할 수 있다. | Project Panel은 기본적으로 Editor의 활성 파일을 자동 reveal하며 설정으로 바꿀 수 있다. | 활성 파일 reveal과 일반 tree 변경 시 scroll 보존은 별도 동작으로 정의한다. |
| Preview와 고정 탭 | 한 번 클릭하면 preview로 열고, 편집하거나 두 번 클릭하면 고정 탭으로 승격한다. | 한 번 클릭 또는 Space로 preview하고, 편집/두 번 클릭으로 고정하거나 가운데 클릭으로 고정 탭을 연다. | 현재 tree의 단일/두 번 활성화는 대체로 일치한다. 이 검토에서 추가 parity 작업을 제안하지 않는다. |

공식 자료: [VS Code Breadcrumbs](https://code.visualstudio.com/docs/editing/editingevolved), [VS Code UI와 Explorer](https://code.visualstudio.com/docs/editing/getting-started/userinterface), [Zed Project Panel](https://zed.dev/docs/project-panel), [Zed 설정](https://zed.dev/docs/reference/all-settings), [Zed Outline Panel](https://zed.dev/docs/outline-panel).

## 목표 결과 계약

다음은 목표 결과다. Tree reopen과 scroll 보존은 runtime 수락을 통과하지 않았다.

### Tree 탐색

1. 명시적인 이동 요청 없이 tree 내용이 바뀌면 기존 첫 표시 행이 아직 존재하는 동안 같은 viewport 위치를 유지한다. 행이 삭제됐으면 이전 위치에 가장 가까운 남은 행을 기준으로 한다. Pixel offset만 저장하지 말고 anchor identity와 행 내부 offset을 저장한다. Panel을 숨겼다가 다시 열거나 폭을 조절해도 저장된 위치를 유지한다.
2. Branch 펼침/접기, 폴더 새로고침, viewport 위에 자식 추가를 해도 viewport를 최상단이나 무관한 위치로 보내지 않는다.
3. Tab 전환, Quick Open 또는 다른 surface에서 Editor 파일이 바뀌면 tree에서 ancestor를 펼치고 해당 행을 reveal한다. 향후 설정으로 reveal을 끄면 활성 상태만 갱신하고 viewport는 움직이지 않는다. Tree에서 직접 파일을 열 때 중복 이동하지 않는다.
4. 오래된 directory 응답이 같은 branch의 최신 데이터나 새 workspace root의 데이터를 덮지 않는다.
5. Selection, keyboard focus, 활성 Editor item, 보이는 scroll anchor는 서로 다른 상태다. 명시적 이동 요청이 필요한 경우 외에는 하나를 바꿔도 나머지를 초기화하지 않는다.

### Editor Breadcrumb

1. 파일 경로가 있는 Editor와 Viewer 위에 Workspace 기준 경로를 표시한다. Workspace root를 첫 context로 두고 현재 파일명이 식별되도록 separator와 truncation을 적용한다.
2. Path segment를 선택하면 해당 단계의 형제 항목으로 이동할 수 있다. 항목을 고르면 기존 file-kind routing으로 연다. 폴더 이동은 TreeView에서 그 폴더를 reveal할 수 있다.
3. Rename, move, workspace root 변경, tab 전환 후에는 활성 item의 현재 identity/path를 표시한다. 저장 전 새 문서에 가짜 파일 경로를 만들지 않는다.
4. Keyboard로 접근 가능하고 current item과 menu 의미를 보조 기술에 전달한다. 긴 경로의 접근성 이름에는 전체 경로를 제공하고 overflow를 예측할 수 있게 처리한다.
5. Path Breadcrumb은 symbol Breadcrumb과 독립적으로 제공한다. 이후 symbol trail은 provider가 안정적인 range와 label을 제공할 때만 추가한다.

## 구현 전에 결정할 사항

- 활성 파일 auto-reveal을 설정으로 바꿀지 결정한다. 현재 항상 활성화돼 있고 Zed는 이를 설정할 수 있다.
- Breadcrumb을 이미지/PDF viewer 등 모든 파일 surface에 추가할지 결정한다. 현재 code와 Markdown Editor에만 연결됐다.
- Breadcrumb의 형제 메뉴에 hidden/ignored 항목을 포함할지와 정렬 기준을 결정한다. 별도 제품 요구가 없으면 현재 Workspace tree의 표시/정렬 규칙을 재사용한다.
- Breadcrumb root를 workspace name, workspace folder, 단일 파일 workspace의 축약 절대 경로 중 무엇으로 할지 결정한다.

## 구현 및 검증 상태

1. TreeView anchor 보존과 stale load 무효화: 코드가 있으나 최신 사용자 보고 기준 runtime 수락 실패.
2. 활성 파일 ancestor 펼침과 reveal: 코드가 있으나 scroll 보존과 의도를 분리해야 한다.
3. Host가 child 목록과 파일 routing을 제공하는 공통 path Breadcrumb: code/Markdown에 구현됨.
4. Scroll, root 변경, 활성 파일 reveal, rename/move, keyboard 접근, 긴 경로 자동 UI 회귀 시나리오: 아직 필요하다.

마지막 변경 후 현재 앱을 직접 확인하지 않았다. Workspace typecheck와 architecture source/link 검사는 통과했지만 scroll 또는 toggle 동작을 입증하지 않는다. 자동 UI 테스트도 추가하거나 실행하지 않았다. 실행 중인 앱에서 선택/열기, toggle, resize, tab switch를 확인하기 전에는 NAV-01을 닫지 않는다.
