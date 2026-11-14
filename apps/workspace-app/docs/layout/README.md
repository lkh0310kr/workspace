# Workspace와 pane layout 계약

범위는 제품 여정 J-01과 J-02의 shell 부분이다. source는 [workspaceStore](../../src/renderer/src/store/workspaceStore.ts), [model registry](../../src/renderer/src/store/workspaceLayoutModels.ts), [layoutSession](../../src/renderer/src/layout/layoutSession.ts), [PaneGroup](../../src/renderer/src/panes/PaneGroup.tsx), [layoutActions](../../src/renderer/src/layout/layoutActions.ts)다.

## 상태 owner

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
| explorer 폭·모드·확장·scroll      | pane별 explorer state                            | PaneGroup의 sidebar와 explorer adapter        |

App component의 modelsRef나 PaneGroup의 별도 localActiveId는 현재 owner가 아니다. UI는 layout mutation을 임의 zustand 복사본에 쓰지 않는다. workspaceLayoutModels는 model·saved JSON·ensure-inflight·pending rebalance를 각각 보관하며 workspace 제거 시 모두 정리한다.

## Identity와 config

workspace tab ID(number), flexlayout node ID, pane item ID(string), terminal ID(number)는 서로 다른 식별자다. pane node ID를 item ID에서 만들지 않는다. PaneGroupConfig는 선택적 schemaVersion, `tabs: PaneTabItem[]`, `activeTabId: string`, 선택적 zoom이다. kind는 terminal/browser/code/markdown/viewer/pkms다. 전체 field는 [paneTypes](../../src/renderer/src/layout/paneTypes.ts)가 기준이다.

readPaneGroupConfig는 config가 없으면 빈 tabs/active ID를 사용한다. active ID가 목록에 없으면 첫 item, 목록도 없으면 빈 문자열이다. activatePaneTab은 node가 TabNode이고 item이 존재할 때만 성공한다. 새 terminal 기본 pane은 빈 layout guard가 중복 ensure-inflight를 막아 생성한다.

## Hydration과 저장

hydrate는 tabs의 순서·ID·title·root·JSON 동등성을 비교한다. 같은 상태면 기존 tabs reference와 live model을 보존한다. JSON 문자열이 달라도 JSON parse/serialize 결과가 같으면 동등하다. 다른 saved layout, 없는 model, 비어 있는 model은 modelFromLayoutJson으로 재생성하고 layout revision을 올린다. 사라진 workspace의 model·focus를 제거한다.

persistLayout은 model.toJson을 serialize하고 saved JSON cache를 즉시 갱신한 뒤 250ms 후 setTabLayout IPC를 요청한다. **현재 timer는 workspace별 Map이 아니라 module 단일 persistTimer다.** 서로 다른 workspace의 연속 예약도 마지막 예약으로 대체될 수 있으므로 workspace별 durable flush를 보장하는 계약으로 설명하지 않는다. 이 제한은 제품 코드 수정이 필요한 후속 항목이다.

[host callbacks](../../src/renderer/src/hooks/useLayoutHostCallbacks.tsx)는 구조 action에서 revision을 올리고 move policy·pending rebalance·split scroll 복원을 적용한 뒤 persistLayout을 요청한다. SELECT_TAB/SET_ACTIVE_TABSET도 render revision에 반영한다. 임의 model.doAction 뒤 revision 갱신을 누락하지 않는다.

## 파일 preview·닫기·탭 이동

같은 path의 파일 item이 있으면 활성화하고 pin 요청이면 isPreview=false로 바꾼다. 새 단일 click 파일은 preview이며 pane당 이전 preview를 재사용할 수 있다. dirty 파일은 폐기 전 확인, double activate 등 명시 pin은 고정 탭으로 유지한다. 구체 open 경로는 PaneGroup, dirty 판정과 cache 폐기는 editor package registry가 맡는다.

close/move/split의 mutation은 layoutActions를 통해 수행한다. 마지막 item/마지막 pane은 default terminal 복구 또는 pane 제거 정책을 따른다. terminal process는 모든 workspace layout의 참조가 사라질 때 Main이 정리하고 browser item 제거는 persistent guest를 destroy한다. chip reorder, pane split drag, strip 밖 drop은 다른 입력 경로이며 layoutMovePolicy/layoutSplitPolicy와 tab drag state를 사용한다.

## 표시와 focus 경계

workspace host와 일반 chip은 mount를 유지하고 visibility/pointer-events로 숨긴다. chip 표시는 workspace+pane visible AND chipActive여야 한다. browser guest는 별도 overlay viewport와 coordinator 정책을 사용하므로 일반 host 스타일을 guest ancestor 전체에 강제하지 않는다. [interaction](../interaction/README.md)을 따른다.

PaneGroup은 dirtyByTabId와 jump 요청을 UI 임시 상태로 소유하고, explorer는 pane당 하나다. browser visibility/focus 등록은 BrowserContent가 소유하며 PaneGroup이 같은 coordinator 호출을 복제하지 않는다.

## 수락 근거

| ID     | 시나리오                                   | 확인 경로                                                                                      |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| LAY-01 | stale active ID/빈 tabs fallback           | layoutSession.test.ts                                                                          |
| LAY-02 | 이동·split 후 item/terminal ID 보존        | layoutActions.mutations/split, layoutTabDrop 테스트                                            |
| LAY-03 | preview 파일을 다시 열거나 pin             | PaneGroup source 대조, 실제 editor 통합 검증 필요                                              |
| LAY-04 | dirty close 취소                           | layoutActions.closeTab와 editor registry; 이전 전체 suite에 실패가 있어 native 완료 주장 안 함 |
| LAY-05 | 다른 workspace에 연속 persist              | 단일 timer 제한 확인; workspace별 flush 검증은 후속                                            |
| LAY-06 | root 변경 후 explorer 이전 확장 복원 안 함 | explorerState.test.ts                                                                          |

테스트 이름은 `src/renderer/src/layout` 및 `explorer` 아래다. source 대조와 자동 test 결과·installed app acceptance는 별도로 기록한다.
