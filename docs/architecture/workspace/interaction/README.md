# Interaction·focus·overlay 계약

[InteractionCoordinator](../../../../apps/workspace-app/src/renderer/src/interaction/InteractionCoordinator.ts)는 renderer singleton이다. global 규칙을 구현하는 앱 내부 owner이며 active workspace, guest 등록, pane/chip 상태, overlay stack, portal Map, pending guest focus를 관리한다. Browser guest DOM 수명은 [Browser](../browser/lifecycle.md)가 소유한다.

## 표시·입력 결정표

[webviewPolicy](../../../../apps/workspace-app/src/renderer/src/interaction/webviewPolicy.ts)의 입력은 workspaceTabId, activeWorkspaceTabId, paneVisible, chipActive, overlayBlocked, portalsOpen이다. `paneLive = workspace ID 일치 && paneVisible`이다.

| 조건                                     | guest visible | guest interactive |
| ---------------------------------------- | ------------- | ----------------- |
| 비활성 workspace/pane 또는 inactive chip | false         | false             |
| 활성 + overlay block                     | false         | false             |
| 활성 + portal open + overlay 없음        | true          | false             |
| 활성 + overlay/portal 없음               | true          | true              |
| 미등록 orphan guest                      | false         | false             |

reconcile은 등록 guest에 display:flex/none, pointerEvents:auto/none, inert를 적용한다. orphan은 teardown 중 남은 DOM이어도 숨긴다. viewport shell의 paintable/active 스타일과 guest 정책은 별도 계층이다. 일반 content 스타일은 [embedPolicy](../../../../apps/workspace-app/src/renderer/src/interaction/embedPolicy.ts)가 visibility와 pointerEvents를 `paneVisible && chipActive`로 결정한다.

## Overlay·portal 수명

pushOverlayBlock(source)은 stack에 한 항목을 추가하고 즉시 reconcile한다. pop은 마지막 동일 source를 제거하며 **동일 source가 없고 stack이 비지 않았으면 마지막 항목을 대신 pop한다.** source token 불일치를 무조건 무시하는 reference-count API가 아니다. 정상 경로는 source를 짝지어 해제해야 한다. clear는 비지 않은 stack을 비우고 reconcile한다.

registerPortal(id,dismiss)는 Map에 등록 후 reconcile하고 해제 함수가 제거/reconcile한다. dismissAllPortals는 기존 .popover-catcher를 제거하고 dismiss 콜백을 호출하며 component cleanup이 등록 해제를 수행한다. body portal의 실제 소유 component는 등록/해제를 빠뜨리지 않는다. drag block과 portal open의 guest 표시 차이를 유지한다.

## Workspace·chip과 focus

setActiveWorkspaceTab은 같은 ID면 기본 no-op, force 옵션이면 reconcile한다. 다른 ID 전환 전 embed focus를 renderer로 이동하고 ID를 갱신한다. 전환 전에 embed focus가 있었다면 새 primary browser focus 복귀를 시도한다.

setBrowserPaneChipState는 같은 paneNodeId의 다른 browser chip 활성값을 내리고 대상 paneVisible/chipActive를 함께 반영한다. 보이거나 활성화되는 전이에서 pendingFocus를 설정하고 한 번 reconcile한다. 숨겨지면 해당 guest를 blur한다. explicit requestBrowserGuestFocus는 pending guest를 지정하고 reconcile한다.

focus schedule은 guest별 epoch로 이전 요청을 무효화하고 animation frame에서 interactive 조건을 재확인한다. detach/unregister·상태 변경으로 불가능해진 guest에 무조건 focus하지 않는다. 실제 webview host/native guest/terminal focus relay는 [browserGuestFocus](../../../../apps/workspace-app/src/renderer/src/browser/browserGuestFocus.ts)가 조정한다. Terminal 입력 전 releaseKeyboardFromBrowserGuests는 native blur IPC·active guest 해제·renderer focus 복귀를 수행한다.

## 검색 단축키와 입력 focus

`Cmd/Ctrl+P`는 workspace Quick Open, `Cmd/Ctrl+Shift+F`는 활성 pane group의 파일 내용 검색을 연다. Electron host renderer와 browser webview guest 모두에서 단축키가 동작해야 한다. Chromium의 인쇄/찾기 기본 동작이 가로채지 않도록 main process `before-input-event` 경계에서 shortcut IPC로 전달한다. Home 화면에서는 Quick Open을 열지 않는다. PKMS pane은 PKMS 자체 Quick Open으로 위임한다.

Find in Files를 이미 열어 둔 상태에서 단축키를 다시 누르면 검색 input이 다시 focus된다. 입력 focus는 기존 query를 보존한다. Quick Open은 열리는 즉시 query input으로 focus를 이동해 첫 입력을 받는다. 키 입력·focus·표시 결과는 renderer의 긴 동기 검색/정렬 작업 때문에 멈추지 않아야 한다. Quick Open 이름 검색과 Desktop 파일 내용 검색의 provider/result 규칙은 [Editor 검색 스펙](../../editor/search.md)을 따른다.

단축키 acceptance: INT-07 `Cmd/Ctrl+P`를 host renderer 또는 webview guest에 focus한 채 누르면 Quick Open이 열린다. INT-08 같은 두 입력 경계에서 `Cmd/Ctrl+Shift+F`를 누르면 Search panel이 열리고 query input이 focus된다. INT-09 이미 열린 Search panel에서 다시 실행하면 query 유지 상태로 input이 재-focus된다. INT-10 검색어를 연속 입력할 때 화면 입력이 멈추지 않고 최신 검색 결과만 보인다. shortcut relay의 단위 테스트와 실제 packaged Electron/webview 확인을 구분해 기록한다.

## 관찰과 재구현 시나리오

snapshot은 active workspace·overlay count/sources·guest·portal·최근 reconcile을 제공하고 subscribe는 해제 함수를 반환한다. debug panel은 진단 수단이며 durable 상태 저장소가 아니다.

INT-01 활성 guest 위 portal을 열면 페이지는 보이되 클릭하지 못한다. INT-02 drag block 해제 직후 reconcile이 입력을 복구한다. INT-03 같은 pane browser chip은 하나만 활성이다. INT-04 orphan guest가 terminal 위에서 입력을 가로채지 않는다. INT-05 workspace 전환 중 renderer/guest focus가 stale ID를 대상으로 삼지 않는다. INT-06 중첩 block은 각 소유자가 같은 source로 해제한다.

자동 근거는 [coordinator 테스트](../../../../apps/workspace-app/src/renderer/src/interaction/InteractionCoordinator.test.ts), [policy 테스트](../../../../apps/workspace-app/src/renderer/src/interaction/webviewPolicy.test.ts), embedPolicy·workspaceScope·dragSession 테스트다. OS native focus의 전체 동작은 실제 Electron 환경에서 추가 검증한다.
