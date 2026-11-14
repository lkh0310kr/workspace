# Treeview 스펙

공유 [EditorTreeView](../../src/EditorTreeView.tsx)는 렌더·입력 라우팅을, [Desktop TreeView](../../../../apps/workspace-app/src/renderer/src/components/TreeView.tsx)는 provider 로딩·영속 상태·실제 파일 작업을 소유한다.

## 상태와 데이터 흐름

공유 row model은 `id,path,name,kind,depth`와 선택적 expandable/expanded/loading/active/selected/multiSelected/cut/dropTarget/tabIndex/trailingStatus/showGuides/source를 가진다. projection은 rows/startIndex/paddingTop/paddingBottom/totalHeight다. 공유 UI는 provider를 직접 호출하지 않고 callback으로 선택·activate·context·drop을 위임한다.

row에는 file/folder type icon을 표시하지 않는다. folder expand/collapse disclosure와 depth guide만 유지하고, 아이콘 폭 없이 이름을 정렬한다.

Desktop local TreeView는 Git이 무시하는 파일/폴더를 계속 탐색·열기 가능하게 표시하되 이름만 muted foreground로 구분한다. 무시 여부는 renderer에서 `.gitignore` 문자열을 직접 해석하지 않고 workspace root 기준 `git check-ignore` 결과를 사용한다. 이는 중첩 `.gitignore`, negation, 저장소 설정과 이미 추적 중인 파일의 Git 판정을 따른다. foreground 변경은 행 배경·선택·hover·키보드 동작을 바꾸지 않는다. Git 저장소가 아니거나 Git 판정을 얻지 못해도 directory listing은 유지하고 항목을 일반 상태로 표시한다. 이 Git decoration은 Desktop local provider에만 적용한다. PKMS client의 sync exclusion pattern은 Git ignore가 아니므로 같은 상태로 표시하지 않는다.

Desktop은 path→`{entries,loaded}` branch Map, expanded Set, focusedPath/anchorPath/selectedPaths, menu/prompt, dropTarget, scrollTop, 첫 가시 행의 path와 행 내 offset, viewportHeight를 소유한다. provider lease는 Explorer와 Editor가 공유한다. loadDir는 path를 directory item으로 resolve하고 listChildren(parentId)를 수행한다. notFound는 로딩 중단, 기타 오류는 console.error다. 요청마다 branch sequence와 root path를 캡처하며, 늦게 완료된 오래된 branch/root 응답은 버린다.

Desktop TreeView는 pane 본문 위에 떠 있는 왼쪽 sidebar다. visible toggle button은 두지 않는다. 열림은 pane group별 persistent chrome state이며 본문 폭을 줄이지 않는다. 사용자가 resize handle을 120px 아래로 줄이면 닫히고, pane 본문 폭이 560px 이하이면 sidebar를 숨긴다. `Cmd+\`(macOS) / `Ctrl+\`(Windows/Linux)는 editor focus 여부와 관계없이 현재 focused pane group의 Explorer를 토글한다. 닫았다 다시 열면 마지막 폭을 복원한다. 열린 상태에서는 panel surface/shadow가 editor 내용과 구분되며 빈 바깥 영역은 editor input을 가로채지 않는다.

초기화/루트 변경 때 branch와 selection을 초기화하고 root와 복원된 expanded branch를 로드한다. root가 바뀌면 저장된 tree state를 reset한다. 저장된 anchor path/offset을 우선 복원하고, anchor가 없거나 목록에서 사라졌으면 pixel scrollTop을 사용한다. 복원은 root와 expanded branch 응답이 끝난 뒤 적용해 초기 빈 목록에 의해 clamp되지 않게 한다. 외부 scroll container는 passive scroll listener와 ResizeObserver로 가상화를 갱신한다. 행 목록이 바뀌면 직전 첫 가시 행의 path와 행 내 offset을 찾아 같은 viewport 위치를 유지하고, 해당 행이 삭제된 경우 이전 행 index에서 가장 가까운 생존 행으로 보정한다. workspace/tab 범위 변경은 이전 anchor를 폐기한다. expanded, pixel scrollTop, anchor는 host의 explorer state storage에서 관리하며 공통 UI가 localStorage를 직접 소유하지 않는다. 패널 숨김/표시와 너비 조정은 scroll 위치를 초기화하지 않는다.

## 정렬과 가상화

근거: [treeModel.ts](../../src/treeModel.ts).

- root path는 `''`, depth=0. branch마다 directory 먼저, 이름은 localeCompare(undefined,{sensitivity:'base'})로 정렬한다.
- expanded directory에 대해서만 깊이 우선으로 후손을 펼친다. ancestor path Set으로 순환을 막는다. 로드되지 않은 branch는 행이 없다.
- 기본 row height=27px, overscan=4. start=max(0,floor(scrollTop/27)-4), count=ceil(height/27)+8, end=min(total,start+count).
- top=start*27, bottom=max(0,(total-end)*27), totalHeight=total*27이다. height<=0 또는 빈 목록이면 원래 rows를 모두 반환하고 spacer=0이다.
- VirtualList는 item.id key, `role=group`, minHeight=totalHeight, aria-hidden spacer와 빈 목록 표시를 사용한다.
- Markdown row label은 `.md`만 대소문자 무관 제거한다. `.markdown`까지 제거하는 본문 제목 규칙과 다르다.

## 선택과 키보드

근거: [treeSelection.ts](../../src/treeSelection.ts), [treeNavigation.ts](../../src/treeNavigation.ts).

| 입력             | 전이                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| 일반 click       | focused=anchor=path, 선택은 해당 한 항목; onActivate 실행                                                    |
| Ctrl/Meta click  | multiSelect일 때 선택 toggle, focused/anchor=path; activate하지 않음                                         |
| Shift click      | anchor 또는 focus 또는 자기 자신을 기준으로 visiblePaths의 inclusive range 선택; additive면 기존 선택과 합침 |
| 빈 공간 click    | onClearSelection                                                                                             |
| Down/Up          | 표시 행 한 칸 이동, 양 끝 clamp; focus 없으면 첫/마지막 행                                                   |
| Right            | directory가 접혔으면 expand, 펼쳤으면 다음 행이 자식일 때 focus                                              |
| Left             | expanded directory면 collapse, 아니면 표시된 부모로 focus                                                    |
| Enter            | activate                                                                                                     |
| F2               | rename                                                                                                       |
| Delete/Backspace | delete                                                                                                       |

보이지 않는 path에 대한 selection 요청은 현재 상태를 그대로 반환한다. range anchor가 visiblePaths에 없으면 클릭한 위치만 범위로 사용한다. 파일 작업 전 selected directory의 후손을 제거해 작업 root를 만든다. 공유 resolver는 의미 action만 반환하고 host가 capability와 실제 작업을 판단한다. row는 button role=treeitem, aria-level=depth+1, aria-selected=selected||multiSelected, expandable일 때 aria-expanded를 설정한다. 들여쓰기는 8+depth*14 px다. root `role=tree`, aria-label, aria-multiselectable, aria-busy를 제공하고 row의 tabindex 기본값은 -1이다.

## 파일 열기와 변경

Desktop에서 파일을 열기 전 조상 directory를 expand하고 미로드 branch를 읽는다. 활성 editor path가 외부에서 바뀌면 해당 파일의 조상을 expand하고 행이 projection에 나타난 뒤 scroll viewport로 reveal한다. 이는 목록 갱신 시 anchor 보존과 별개인 명시적 navigation이다. onOpenFile은 path와 code/markdown/viewer 및 선택적 pin을 받는다. 공유 shell은 단일 activate와 double activate callback을 구분한다.

create/rename/menu는 capability와 메서드를 함께 확인한다. 파일 자동 이름은 unique-name helper가 case-insensitive sibling Set에서 `base+extension`을 먼저 시도하고 이미 있으면 `base 1+extension`, `base 2+extension` 순으로 첫 빈 이름을 찾는다. directory 생성 prompt는 입력 이름으로 createDirectory를 실행한다. rename은 provider rename, 성공 path 변경 통지는 host가 담당한다. 삭제는 root 선택으로 축약하고 삭제 확인 후 영향을 받는 열린 dirty 문서 확인을 추가로 수행한다. 확인 취소 시 provider delete를 호출하지 않는다. Desktop UI는 root path마다 delete([ref])를 순차 호출하고 첫 실패에서 중단한다. 성공 경로는 onPathDeleted를 통지하고 부모를 refresh한다. 실패/미처리 선택은 남기며 삭제된 anchor/focus는 남은 첫 항목으로 바꾼다. coordinator reconcile과 drag 정리 후 다음 frame에서 기존 scroll을 새 최대치로 clamp해 복원한다. provider가 여러 ref를 미리 검증하는 것과 UI가 여러 작업을 transaction으로 수행하는 것은 다르다.

subscribeTree가 전달한 parentId는 host에서 path로 바꾼다. root가 포함되면 root와 모든 expanded branch를 재로드한다. 그 외에는 `dirsToReloadForChange`로 root와 expanded ancestor를 모아 재로드한다. 이 helper는 입력 경로의 부모부터 걷기 때문에 곧바로 해당 branch 하나만 새로 읽는 알고리즘과 다르다. 구체 동작은 [treeReload.ts](../../../../apps/workspace-app/src/renderer/src/explorer/treeReload.ts)를 따른다.

pane이 숨겨지거나 workspace dismiss-portals 이벤트가 오면 menu/prompt를 닫는다. unmount에서 provider lease, scroll/resize/drag listeners를 해제한다.

## Drag and drop

기본 MIME은 `application/x-workspace-editor-tree-paths`, payload는 JSON string[]다. canMove이고 MIME이 일치할 때 dragover를 수락한다. directory/expandable 행은 자기 path, 파일 행은 부모 path, root는 `''`가 destination이다. drop은 propagation/default를 막고 target을 지운 뒤 parse된 paths를 callback에 넘긴다. 잘못된 JSON은 []이며 공유 shell은 실제 move를 하지 않는다.

host는 canMove=`capabilities.dragMove && supportsOperation('move')`를 사용한다. provider는 stale ref와 destination, 자기 후손 이동을 재확인한다. dragend에서 target 표시를 정리한다.

## 검증 시나리오

| ID      | 데이터/행동                                                                          | 기대 결과                                                                                                 |
| ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| TREE-01 | 파일 z, directory b, 파일 A                                                          | b→A→z 순서                                                                                                |
| TREE-02 | 100행, scroll=270, height=270                                                        | start=6, 최대 18행, top=162, total=2700                                                                   |
| TREE-03 | A 선택 후 Shift-C                                                                    | visible 순서 A~C 선택, 활성 파일은 modifier click으로 바뀌지 않음                                         |
| TREE-04 | 폴더와 그 후손 함께 삭제                                                             | provider에는 조상 작업만, dirty 취소 시 삭제 없음                                                         |
| TREE-05 | 잘못된 drag JSON                                                                     | 예외 없이 [] 전달                                                                                         |
| TREE-06 | Right/Left 반복                                                                      | expand→첫 자식→부모→collapse                                                                              |
| TREE-07 | pane hide                                                                            | 열린 context menu와 이름 prompt 제거                                                                      |
| TREE-08 | viewport 첫 행 위에 sibling 행을 삽입하거나 제거                                     | 같은 path가 살아 있으면 첫 가시 행과 행 내 위치 보존; 행이 삭제되면 이전 index의 가장 가까운 생존 행 사용 |
| TREE-09 | 다른 editor tab/Quick Open에서 접힌 폴더의 파일 활성화                               | 조상 폴더를 펼치고 활성 행을 viewport에 reveal                                                            |
| TREE-10 | 동일 branch refresh 두 건을 시작하고 첫 요청을 늦게 완료                             | 마지막 요청 응답만 branch에 반영                                                                          |
| TREE-11 | root A의 branch 로드 중 root B로 전환, 두 root에 같은 상대 경로 존재                 | root A의 늦은 응답이 root B의 tree를 바꾸지 않음                                                          |
| TREE-12 | `Cmd+\` 또는 `Ctrl+\`를 focused file pane에서 입력                                   | 해당 pane의 docked Explorer만 열리고 닫힘; editor focus 상태에서도 동작                                   |
| TREE-13 | Explorer resize handle을 120px 미만으로 줄임                                         | Explorer가 닫히고 다음 열기에서 마지막 유효 폭으로 나타남                                                 |
| TREE-14 | pane 본문 폭을 560px 이하로 축소                                                     | Explorer는 보이지 않고 본문이 pane 전체를 사용함; 폭을 넓히면 open state일 때 다시 표시                   |
| TREE-15 | Desktop local repo의 `.gitignore`가 새 파일/폴더를 무시하고 항목이 TreeView에 표시됨 | 이름만 muted 색으로 보이며 열기·선택·이동 동작과 행 배경은 일반 항목과 같음                               |
| TREE-16 | `.gitignore` 패턴에서 `!` negation으로 다시 포함된 파일                              | ignored 표시가 없고 일반 색으로 보임                                                                      |
| TREE-17 | 무시 패턴과 일치하지만 Git이 이미 추적 중인 파일                                     | ignored 표시가 없음                                                                                       |
| TREE-18 | Git 저장소가 아닌 workspace 또는 Git 판정 실패                                       | 디렉터리 목록은 정상 표시되고 모든 항목은 일반 색으로 보임                                                |
| TREE-19 | ignored 항목에 hover, keyboard focus, active/selection 적용                          | muted 파일명은 유지되고 hover/selection/focus 배경과 동작은 보존                                          |

기존 자동 근거는 TreeView.test, useTreeProjection.test, treeReload.test다. Git ignore 판정은 files.test에서 별도 검증한다. provider I/O 실패·dirty 확인·실제 DnD도 추가 통합 검증이 필요하다.
