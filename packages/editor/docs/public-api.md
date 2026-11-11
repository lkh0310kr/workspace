# 공개 API와 작은 UI 계약

Package scope에서 [index.ts](../src/index.ts)의 export를 역할별로 연결한다. 실제 prop/type declaration은 source가 기준이며 소비 앱에서 별도 복사한 구현을 표준으로 취급하지 않는다.

## API owner 지도

| export family | 계약 문서 | host extension point |
|---|---|---|
| Provider/Session/Snapshot/Error·capability helpers | [provider](./provider.md) | 저장소·revision·save 정책 |
| createEditorView/documentReplacement/TextSurface | [text surface](./code/README.md) | extensions·session·storage·onViewReady |
| MarkdownEditor/Document/Surface/Title·commands | [Markdown](./markdown/README.md) | parser·image/link resolver·title commit |
| EditorBreadcrumbs | [Breadcrumb](./breadcrumbs.md) | provider-relative path·sibling listing·open-file routing |
| tree rows/virtual list/selection/navigation | [treeview](./treeview/README.md) | branch data·provider commands·focus·drop |
| QuickOpen/SearchButton/editorSearch/fuzzy | [search](./search.md) | query/provider·결과 선택·dialog close |
| documentIdentity/dirtyRegistry/viewStateCache | [text surface](./code/README.md) | shell close confirmation·stable key migration |
| relativeLink/tree path/title/name/outline helpers | [Markdown](./markdown/README.md), [treeview](./treeview/README.md) | 제품별 파일 분류·링크 열기 |
| TabChip/DocumentTabBar/MenuList/NameForm | 아래 UI 계약 | selection/close/명령 실행·표시 위치 |
| CSS·themes | package CSS와 themes.ts | host className·토큰·container style |

## Tab와 close

[EditorDocumentTabBar](../src/EditorDocumentTabBar.tsx)는 tabs(id,label,title?,dirty?,icon?), activeId와 onSelect/onClose를 받는다. role=tablist, 기본 ariaLabel=Open documents. item.id를 key로 쓰고 chip click은 onSelect(id), close는 onClose(id)다. component가 provider save/dirty 확인·탭 배열 mutation을 수행하지 않는다. host가 close 전에 registry 확인과 cache discard를 수행한다.

TabChip의 focus/drag/context event props와 class hooks는 [source](../src/EditorTabChip.tsx)를 따른다. preview pin, pane split/drag payload는 Desktop app의 layout 책임이며 DocumentTabBar 기본 동작만으로 지원한다고 가정하지 않는다.

## Menu와 이름 입력

[EditorMenuList](../src/EditorMenuList.tsx)는 host가 만든 item 목록과 action을 렌더링한다. capability 판정·위험 작업 확인·실제 provider 호출은 host 책임이다. 지원 형태는 separator 또는 item(id,label,disabled?,active?,danger?,icon?,onSelect)이다. role=menu/menuitem, disabled 항목을 제외한 Up/Down 순환과 Home/End focus를 지원한다. item 선택은 onSelect 후 onClose를 호출한다. 공통 menu가 파일시스템 권한을 판단하지 않는다.

[EditorNameForm](../src/EditorNameForm.tsx)의 초기값은 빈 문자열, submitLabel=Save, titleTag=div, selectInitialValue=false다. initialValue/selectInitialValue 변경 시 내부 value를 reset하고 다음 animation frame에 focus·선택한다. cleanup은 frame 취소다. submit은 preventDefault 후 trim한 비어 있지 않은 값만 onSubmit에 전달한다. 빈 값은 submit disabled. Cancel은 onCancel이다. slash·파일명 충돌·readOnly 검증은 host/provider 계약이다. Escape로 취소를 자동 추가한 것으로 구현하지 않는다.

## 변경·검증 경계

PUB-01 모든 export가 계약 owner를 갖는다. PUB-02 close click이 provider mutation을 직접 하지 않는다. PUB-03 NameForm 초기값 변경·빈 값·trim·cleanup을 보존한다. PUB-04 capability 없는 action을 host가 노출하지 않는다. PUB-05 CSS entrypoint를 소비한 앱에서 같은 기본 구조를 렌더링한다.

현재 source/주요 동작을 대조한 문서다. 모든 public component의 prop 조합·keyboard·pixel fixture를 검증한 상태는 아니며, source 링크만으로 그 차이를 감추지 않는다.
