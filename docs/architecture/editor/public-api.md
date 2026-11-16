# 공개 API와 작은 UI 계약

기본 진입점은 [index.ts](../../../packages/editor/src/index.ts)이며, Editor tree 기능은 [tree/index.ts](../../../packages/editor/src/tree/index.ts)의 `@workspace/editor/tree` 하위 경로로도 제공한다. 기존 기본 진입점의 tree export는 호환을 위해 유지한다. 실제 prop/type declaration은 source가 기준이며 소비 앱에서 별도 복사한 구현을 표준으로 취급하지 않는다.

## API owner 지도

| export family                                      | 계약 문서                                                          | host extension point                                          |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Provider/Session/Snapshot/Error·capability helpers | [provider](./provider.md)                                          | 저장소·revision·save 정책                                     |
| createEditorView/documentReplacement/TextSurface   | [text surface](./code/README.md)                                   | extensions·session·storage·onViewReady                        |
| MarkdownEditor/Document/Surface/Title·commands     | [Markdown](./markdown/README.md)                                   | parser·image/link resolver·title commit                       |
| EditorBreadcrumbs                                  | [Breadcrumb](./breadcrumbs.md)                                     | provider-relative path·sibling listing·open-file routing      |
| Tree pane/frame/rows/virtual list/selection        | [treeview](./treeview/README.md)                                   | header/footer chrome·branch data·provider commands·focus·drop |
| QuickOpen/SearchButton/editorSearch/fuzzy          | [search](./search.md)                                              | query/provider·결과 선택·dialog close                         |
| documentIdentity/dirtyRegistry/viewStateCache      | [text surface](./code/README.md)                                   | shell close confirmation·stable key migration                 |
| relativeLink/tree path/title/name helpers          | [Markdown](./markdown/README.md), [treeview](./treeview/README.md) | 제품별 파일 분류·링크 열기                                    |
| TabChip/DocumentTabBar/MenuList/NameForm           | 아래 UI 계약                                                       | selection/close/명령 실행·표시 위치                           |
| CSS·themes                                         | package CSS와 themes.ts                                            | host className·토큰·container style                           |

## Tree composition

`EditorTreePane`은 공유 virtual tree의 public 조립 component다. 공통 pane frame과 host `header`/`footer` slot을 제공하고 typed `tree` props로 provider-specific callback을 연결한다. `EditorTreeToolbar`는 제목·상태·action 영역의 공통 배치를 제공한다. 저수준 `EditorTreeView`, row, virtual list는 외부 package entry에서 감춰 소비 앱이 독립 tree shell을 만들지 않게 한다. Tree 소스와 스타일, 상태 훅은 `packages/editor/src/tree/`에 둔다. 검색 결과처럼 row tree가 아닌 본문을 조립해야 할 때는 `EditorTreeFrame`을 사용한다.

## Tab와 close

[EditorDocumentTabBar](../../../packages/editor/src/EditorDocumentTabBar.tsx)는 tabs(id,label,title?,dirty?,icon?), activeId와 onSelect/onClose를 받는다. role=tablist, 기본 ariaLabel=Open documents. item.id를 key로 쓰고 chip click은 onSelect(id), close는 onClose(id)다. component가 provider save/dirty 확인·탭 배열 mutation을 수행하지 않는다. host가 close 전에 registry 확인과 cache discard를 수행한다.

TabChip의 focus/drag/context event props와 class hooks는 [source](../../../packages/editor/src/EditorTabChip.tsx)를 따른다. preview pin, pane split/drag payload는 Desktop app의 layout 책임이며 DocumentTabBar 기본 동작만으로 지원한다고 가정하지 않는다.

## Menu와 이름 입력

공용 [MenuList](../../../packages/ui/src/menu-list/MenuList.tsx)는 host가 만든 item 목록과 action을 렌더링한다. Editor는 기존 `EditorMenuList`/`EditorMenuItem` 이름을 호환 별칭으로 재수출한다. capability 판정·위험 작업 확인·실제 provider 호출은 host 책임이다. 지원 형태는 separator 또는 item(id,label,disabled?,active?,danger?,icon?,onSelect)이다. role=menu/menuitem, disabled 항목을 제외한 Up/Down 순환과 Home/End focus를 지원한다. item 선택은 onSelect 후 onClose를 호출한다. 공통 menu가 파일시스템 권한을 판단하지 않는다.

[EditorNameForm](../../../packages/editor/src/EditorNameForm.tsx)의 초기값은 빈 문자열, submitLabel=Save, titleTag=div, selectInitialValue=false다. initialValue/selectInitialValue 변경 시 내부 value를 reset하고 다음 animation frame에 focus·선택한다. cleanup은 frame 취소다. submit은 preventDefault 후 trim한 비어 있지 않은 값만 onSubmit에 전달한다. 빈 값은 submit disabled. Cancel은 onCancel이다. slash·파일명 충돌·readOnly 검증은 host/provider 계약이다. Escape로 취소를 자동 추가한 것으로 구현하지 않는다.

## 변경·검증 경계

PUB-01 모든 export가 계약 owner를 갖는다. PUB-02 close click이 provider mutation을 직접 하지 않는다. PUB-03 NameForm 초기값 변경·빈 값·trim·cleanup을 보존한다. PUB-04 capability 없는 action을 host가 노출하지 않는다. PUB-05 CSS entrypoint를 소비한 앱에서 같은 기본 구조를 렌더링한다. PUB-06 세 tree host는 `EditorTreePane`/`EditorTreeToolbar`를 사용하고 private row/view implementation을 import하지 않으며 계약 검사는 `npm run check`에서 실행한다.

현재 source/주요 동작을 대조한 문서다. 모든 public component의 prop 조합·keyboard·pixel fixture를 검증한 상태는 아니며, source 링크만으로 그 차이를 감추지 않는다.

# Tree 조립

`EditorTreePane`은 공유 가상 트리를 표시하는 public component다. 공통 pane frame을 소유하며 host가 제공하는 `header`/`footer` slot과 타입이 지정된 `tree` callback을 받는다. `EditorTreeToolbar`는 제목·상태·action의 공통 배치를 제공하고 `EditorTreeCreateActions`는 파일·폴더 생성 버튼 UI를 세 host에 제공한다. 생성 권한과 실행은 host/provider가 소유한다. 하위 수준의 `EditorTreeView`, row, virtual-list component는 package 내부에 두어 소비 앱이 tree shell을 따로 만들지 않게 한다. `EditorTreeFrame`은 검색 결과처럼 tree row 없이도 같은 header/content/footer 구조가 필요한 host 화면에 사용한다.
