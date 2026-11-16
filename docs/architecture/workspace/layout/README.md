# Workspace와 pane layout 계약


Pane System 내부에서 `host/`는 layout 수명주기와 callback을, `group/`은 pane group 구성과 표시를, `tabs/`는 pane tab strip/picker/drop을, `overlays/`는 drag/drop overlay를, `registry/`는 pane kind 계약과 기본 등록을 소유한다. `layout/`과 `interaction/`은 이 기능들이 공유하는 순수 layout·interaction 정책이다.
범위는 제품 여정 J-01과 J-02의 shell 부분이다. workspace tab state는 Workspace feature의 [workspaceStore](../../../../apps/desktop/src/renderer/src/features/workspace/state/workspaceStore.ts)가 소유한다. live FlexLayout model과 layout-session 보조 상태는 PaneSystem의 [model registry](../../../../apps/desktop/src/renderer/src/features/pane-system/layout/workspaceLayoutModels.ts)가 소유한다. 관련 source는 [layoutSession](../../../../apps/desktop/src/renderer/src/features/pane-system/layout/layoutSession.ts), [PaneGroup](../../../../apps/desktop/src/renderer/src/features/pane-system/group/PaneGroup.tsx), [pane system feature](../../../../apps/desktop/src/renderer/src/features/pane-system/index.ts), [layoutActions](../../../../apps/desktop/src/renderer/src/features/pane-system/layout/layoutActions.ts)다.

## 상태 소유 책임

| 상태                              | owner·읽기                                       | mutation                                      |
| --------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| Main workspace 탭·root·saved JSON | Main Workspace                                   | workspace IPC → persist/broadcast             |
| live flexlayout Model             | workspaceLayoutModels의 tabId→Model Map          | hydration의 setLayoutModel, layoutActions     |
| 마지막 저장 요청 JSON             | 같은 module의 savedLayoutJson Map                | persistLayout 시 즉시 기록                    |
| renderer workspace 목록·active ID | workspaceStore                                   | hydrateFromWorkspace                          |
| 구조 render revision              | layoutRevisions[workspaceTabId]                  | model 교체/구조 mutation 때 bump              |
| pane 활성 chip render revision    | paneTabSelectionRevisions[workspaceTabId:nodeId] | setActiveTabInGroup에서 즉시 bump             |
| chip tabs와 activeTabId           | flexlayout의 PaneGroupConfig                     | layoutSession.activatePaneTab / layoutActions |
| focused split                     | focusedPaneGroupTabSetByWorkspaceTab             | pane pointer/focus의 focusPaneGroupTabSet     |
| Editor tree 폭·모드·확장·scroll | Editor feature의 pane별 상태                     | Editor sidebar slot                |

App component의 modelsRef나 PaneGroup의 별도 localActiveId는 현재 owner가 아니다. UI는 layout mutation을 임의 zustand 복사본에 쓰지 않는다. workspaceLayoutModels는 model·saved JSON·ensure-inflight·pending rebalance를 각각 보관하며 workspace 제거 시 모두 정리한다.

## 식별자와 설정

workspace tab ID(number), flexlayout node ID, pane item ID(string), terminal ID(number)는 서로 다른 식별자다. pane node ID를 item ID에서 만들지 않는다. PaneGroupConfig는 선택적 schemaVersion, `tabs: PaneTabItem[]`, `activeTabId: string`, 선택적 zoom이다. kind는 terminal/browser/code/markdown/viewer다. 더 이상 지원하지 않는 이전 kind는 layout 복구 과정에서 제거된다. 전체 field는 [paneTypes](../../../../apps/desktop/src/renderer/src/features/pane-system/layout/paneTypes.ts)가 기준이다.

readPaneGroupConfig는 config가 없으면 빈 tabs/active ID를 사용한다. active ID가 목록에 없으면 첫 item, 목록도 없으면 빈 문자열이다. activatePaneTab은 node가 TabNode이고 item이 존재할 때만 성공한다. 새 terminal 기본 pane은 빈 layout guard가 중복 ensure-inflight를 막아 생성한다.

## 복원과 저장

hydrate는 tabs의 순서·ID·title·root·JSON 동등성을 비교한다. 같은 상태면 기존 tabs reference와 live model을 보존한다. JSON 문자열이 달라도 JSON parse/serialize 결과가 같으면 동등하다. 다른 saved layout, 없는 model, 비어 있는 model은 modelFromLayoutJson으로 재생성하고 layout revision을 올린다. 사라진 workspace의 model·focus를 제거한다.

persistLayout은 model.toJson을 serialize하고 saved JSON cache를 즉시 갱신한 뒤 workspace tab별 250ms timer로 setTabLayout IPC를 요청한다. 같은 workspace의 연속 예약은 최신 layout 하나로 합치며, 다른 workspace의 timer는 서로 취소하지 않는다. hydration에서 workspace가 사라지면 해당 workspace의 대기 timer를 취소한다. 앱 종료 전에 IPC가 완료되지 않는 경우까지 durable flush를 보장하지는 않는다.

[host callbacks](../../../../apps/desktop/src/renderer/src/features/pane-system/host/useLayoutHostCallbacks.tsx)는 구조 action에서 revision을 올리고 move policy·pending rebalance·split scroll 복원을 적용한 뒤 persistLayout을 요청한다. SELECT_TAB/SET_ACTIVE_TABSET도 render revision에 반영한다. 임의 model.doAction 뒤 revision 갱신을 누락하지 않는다.

## 파일 preview·닫기·탭 이동

같은 path의 파일 item이 있으면 활성화하고 pin 요청이면 isPreview=false로 바꾼다. 새 단일 click 파일은 preview이며 pane당 이전 preview를 재사용할 수 있다. dirty 파일은 폐기 전 확인, double activate 등 명시 pin은 고정 탭으로 유지한다. 구체 파일 열기와 preview slot 정책은 Editor Desktop feature가 소유하고 pane-system에 pane mutation capability를 호출한다.

close/move/split의 mutation은 layoutActions를 통해 수행한다. 마지막 item/마지막 pane은 default terminal 복구 또는 pane 제거 정책을 따른다. terminal process는 모든 workspace layout의 참조가 사라질 때 Main이 정리하고 browser item 제거는 persistent guest를 destroy한다. chip reorder, pane split drag, strip 밖 drop은 다른 입력 경로이며 layoutMovePolicy/layoutSplitPolicy와 tab drag state를 사용한다.

## 표시와 포커스 경계

workspace host와 일반 chip은 mount를 유지하고 visibility/pointer-events로 숨긴다. chip 표시는 workspace+pane visible AND chipActive여야 한다. browser guest는 별도 overlay viewport와 coordinator 정책을 사용하므로 일반 host 스타일을 guest ancestor 전체에 강제하지 않는다. [interaction](../interaction/README.md)을 따른다.

PaneGroup은 dirtyByTabId와 jump 요청을 UI 임시 상태로 소유한다. 활성 pane kind가 제공하는 sidebar slot만 mount하므로 Editor 검색 단축키와 tree UI는 Editor pane이 활성일 때만 동작한다. Editor 상태는 pane item·node ID를 기준으로 보존한다. Browser visibility/focus 등록은 BrowserContent가 소유하며 PaneGroup이 같은 coordinator 호출을 복제하지 않는다.

## 수락 근거

| ID     | 시나리오                                   | 확인 경로                                                                                      |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| LAY-01 | stale active ID/빈 tabs fallback           | layoutSession.test.ts                                                                          |
| LAY-02 | 이동·split 후 item/terminal ID 보존        | layoutActions.mutations/split, layoutTabDrop 테스트                                            |
| LAY-03 | preview 파일을 다시 열거나 pin             | PaneGroup source 대조, 실제 editor 통합 검증 필요                                              |
| LAY-04 | dirty close 취소                           | layoutActions.closeTab와 editor registry; 이전 전체 suite에 실패가 있어 native 완료 주장 안 함 |
| LAY-05 | 다른 workspace에 연속 persist              | `workspaceStore.persist.test.ts`: workspace별 timer 유지 및 같은 workspace 요청 coalescing     |
| LAY-06 | root 변경 후 이전 Editor tree 확장 복원 안 함 | editorTreeState.test.ts                                                                          |

관련 구현은 `packages/editor/src/tree/` 및 Desktop layout adapter에 있다. source 대조와 자동 test 결과·installed app acceptance는 별도로 기록한다.
