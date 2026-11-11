# Editor 구현 스펙

공유 Editor와 Desktop 호스트의 현재 동작을 재구현하기 위한 계약이다. 기준, 재생성 순서, 검증 방식은 [스펙 운영 규칙](../../../docs/architecture/spec-driven-development.md)을 따른다. 미래 구조를 다루는 [통합 계획](../../../docs/planning/editor-unification.md)과 달리 여기서는 구현된 동작과 현재 제약을 구분한다.

## 구성과 읽는 순서

| 스펙 | 재구현 책임 |
|---|---|
| [공개 API와 UI](./public-api.md) | export owner·tab·menu·이름 form |
| [Breadcrumb](./breadcrumbs.md) | workspace-relative path와 sibling menu |
| [Provider 계약](provider.md) | 타입, capability, 오류, snapshot, session 수명 |
| [Desktop provider 구현](../../../apps/workspace-app/docs/editor/providers.md) | Workspace 파일시스템·ID·충돌·lease |
| [PKMS provider 구현](../../pkms-client/docs/editor-sessions.md) | PKMS local/Yjs/asset session |
| [텍스트 surface](./code/README.md) | CodeMirror, 외부 변경, undo, cache, Desktop 저장 |
| [Treeview](./treeview/README.md) | docked Explorer·pane shortcut·폭 임계값·스크롤 복원·로딩·정렬·가상화·선택·파일 작업 |
| [Markdown](./markdown/README.md) | [현재 동작](./markdown/README.md) · [완성도 목표 스펙](./markdown/product-completeness.md): live preview, 제목 rename, 링크·이미지, 표·수식·다이어그램 계획 |
| [검색](./search.md) | 문서 검색, Quick Open, 파일 내용 검색·치환 |
| [Asset viewer 경계](./assets.md) | Editor에서 포맷별 viewer로 연결하는 계약 |
| [Editor 탐색 비교 검토](../../../docs/planning/editor-navigation-review.md) | TreeView 스크롤·active-file reveal·breadcrumb 구현 배경과 외부 비교 |

## 소유권

`packages/editor`는 React와 CodeMirror로 만든 UI/순수 규칙을 소유한다. 앱의 Electron API, 인증, Yjs, 파일 저장소를 직접 import하지 않는다. `packages/editor/package.json`의 export는 기본 API, `EditorMarkdownSurface`, `code-mirror`, `tree-row`와 네 CSS 진입점을 제공한다. 실제 의존성 버전과 해석 결과는 package manifest와 lockfile을 사용한다.

`apps/workspace-app/src/renderer/src/editor/localEditorProvider.ts`가 Electron renderer shim을 통해 파일시스템을 연결한다. `panes/EditorContent.tsx`는 저장·자동 저장·제목 변경·활성 editor·pane 콜백을 조정한다. `packages/pkms-client/src/features/editor`는 PKMS 파일 레코드와 local/Yjs session을 연결한다. session 저장 정책을 공통 surface로 끌어올리지 않는다.

## Pane 입출력

`panes/kinds/editorKind.tsx`의 `markdown`과 `code`는 모두 `EditorContent`를 렌더링한다. 공통 입력은 workspace `tabId`, `rootPath`, 상대 `filePath | null`, `kind`, `zoom`, 선택적 `jumpToLine`이다. 출력은 `onOpenFile(path, kind)`, `onAssignPath(path)`, `onDirtyChange`, `onJumpConsumed`다. Explorer는 PaneGroup이 editor beside dock 형태로 배치하며 editor content가 소유하지 않는다.

- 새 Editor picker는 `markdown`, `filePath: null`을 만든다. `code`는 기존 파일을 여는 내부 kind이며 picker 항목이 없다.
- 파일 탭 라벨은 basename, 경로가 없으면 `New tab`이다. Markdown 본문 제목의 기본값 `Untitled`와 다르다.
- provider item의 `asset`은 pane의 `viewer`에 대응한다. 두 enum을 동일하게 취급하지 않는다.
- 문서 identity는 `providerId:itemId`, 파일 path는 위치·표시·provider 조회용이다. rename/move가 undo identity를 바꾸면 안 된다.
- host는 shell에서 탭을 닫거나 삭제할 때 dirty registry를 확인한다. `session.close()` 자체에는 저장 또는 확인 대화상자가 없다.

## 경로 분류의 실제 경계

현재 분류기는 하나가 아니다. `TreeView.classifyFile`, `localEditorProvider.kindFor`, `mediaKind.classifyMediaExtension`, Markdown 링크 처리의 확장자 목록이 각기 존재한다. 재구현 시 각각의 호출 경로를 보존한다. 예를 들어 local provider는 `zip`을 asset으로 분류하고 media classifier는 `other`로 분류한다. 이 차이를 임의로 통합하면 기존 파일 열기 동작이 바뀐다.

## 최소 통합 시나리오

| ID | 입력/행동 | 관찰 결과 |
|---|---|---|
| ED-01 | Explorer와 Editor가 같은 workspace를 사용 | provider 객체와 안정 item ID를 공유; 한 소비자 해제만으로 dispose하지 않음 |
| ED-02 | 열린 Markdown 파일 rename | 실제 파일명·탭 path 변경, 같은 문서의 선택/undo 유지 |
| ED-03 | A 로딩 중 B 선택, A가 늦게 완료 | B의 identity에 A 본문이 나타나지 않음; 폐기된 session close |
| ED-04 | dirty 문서를 shell에서 닫기 취소 | 탭과 편집 내용 유지 |
| ED-05 | dirty 문서 닫기 승인 후 재열기 | 폐기한 메모리 cache가 미저장 내용을 되살리지 않음 |

## 근거

[공개 API](../src/index.ts), [pane 등록](../../../apps/workspace-app/src/renderer/src/panes/kinds/editorKind.tsx), [Desktop host](../../../apps/workspace-app/src/renderer/src/panes/EditorContent.tsx), [dirty registry](../src/documentDirtyRegistry.ts). 규칙별 상세 근거와 검증 항목은 하위 스펙에 둔다.
