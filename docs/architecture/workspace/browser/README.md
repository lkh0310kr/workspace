# Browser 구현 스펙

Electron webview guest, pane overlay viewport, renderer/main IPC로 구성한다. 브라우저 페이지는 iframe이 아니다. [수명·포커스](./lifecycle.md), [탐색·session·IPC](./navigation.md)를 함께 구현한다. 공통 shell 조정은 [InteractionCoordinator](../../../../docs/architecture/04-interaction-coordinator.md)를 따른다.

## 모듈과 상태 소유권

경로는 `packages/browser/src` 및 `apps/desktop/src` 기준이다.

| 모듈                                                                                                                                                            | 소유 상태/책임                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| packages/browser/src/browserPageViewport.ts, useBrowserPageSlotViewport.ts                                                                                      | item ID→shell/chromeInset/container, slot root listeners, chrome 높이, viewport 구독 hook           |
| packages/browser/src/BrowserAddressBar.tsx                                                                                                                      | URL 입력, 방문 기록 제안, 주소창 focus/dismiss host port                                            |
| packages/browser/src/browserUrl.ts, browserAddressBarSuggestions.ts, browserHistory.ts, browserNavigationState.ts, browserZoom.ts, browserPageWebviewActions.ts | URL 정책, 제안 순위, 방문 기록, navigation state 안전 조회                                          |
| packages/browser/src/BrowserContent.tsx                                                                                                                         | Browser pane view, URL/loading/error/rendererGone, webContentsId, pending navigation, listener 연결 |
| packages/browser/src/browserPageGuestRecovery.ts                                                                                                                | guest/container 정합성 판정과 stale React ref 복구; persistent registry 조회는 host capability 사용 |
| renderer/src/features/browser/browserPaneHost.ts                                                                                                                | InteractionCoordinator·active guest registry·focus·open-new-tab을 주입하는 Desktop adapter          |
| packages/browser/src/BrowserPaneOverlaySlot.tsx, renderer/src/panes/kinds/browserKind.tsx                                                                       | Browser overlay slot과 Browser pane tab 구성                                                        |
| renderer/src/browser/ensureBrowserPageWebview.ts                                                                                                                | guest 생성 또는 기존 guest 재부착                                                                   |
| renderer/src/layout/browserWebviewRegistry.ts                                                                                                                   | item ID→persistent guest, renderer recovery flag, drag passthrough                                  |
| renderer/src/layout/activeBrowserWebview.ts                                                                                                                     | 현재 활성 guest와 webContentsId 조회                                                                |
| renderer/src/interaction/InteractionCoordinator.ts                                                                                                              | workspace·pane·chip·overlay에 따른 표시/입력/focus 조정                                             |
| main/browserSession.ts                                                                                                                                          | persist:browser session, 권한, UA와 WebAuthn 초기화                                                 |
| main/browserNav.ts, preload/browserApi.ts                                                                                                                       | history/focus 명령, guest/new-tab/download 이벤트 계약                                              |

## 식별자와 host 계약

workspaceTabId는 workspace, paneNodeId는 layout group, item.id는 browser 탭 identity다. webContentsId는 Electron이 발급하는 guest 핸들이며 재생성 때 바뀔 수 있다. 이들을 서로 교체해서 key로 쓰지 않는다.

BrowserContent는 좁은 BrowserPaneItem(url/title/favicon/zoomFactor), workspace tabId, paneNodeId, paneVisible/chipActive와 host capability 및 navigation/focus callbacks를 받는다. URL/title/favicon/zoom 변경은 onUpdate로 layout item에 반영한다. guest 생명주기를 React component mount와 동일시하지 않는다.

PaneGroup은 `PaneKindDefinition.renderOverlay`로 overlay kind를 배치한다. Browser slot과 view는 Browser package가 제공하며, pane kind는 좁은 item data와 callbacks를 전달한다. `BrowserAddressBar`와 `BrowserContent`는 package의 host capability를 사용한다. Desktop이 Electron guest lifecycle·download store·InteractionCoordinator·IPC adapter를 제공한다. tab 선택과 workspace visibility는 계속 표시·입력 신호이며 webview 제거 조건이 아니다.

## 재구현 순서

1. URL 정규화와 main session 초기화, preload API.
2. overlay slot·viewport와 item ID별 guest registry.
3. ensure/recovery·event listener·navigation actions.
4. InteractionCoordinator 등록, 표시·pointer·focus 전이.
5. address suggestions/history, download bar, zoom, 복구 UI.
6. 테스트와 실제 Electron에서 pane 이동/탭 전환/주소 입력/terminal 전환 검증.

브라우저 guest 보존에 대한 메모리 예산이나 LRU eviction 정책은 현재 구현돼 있지 않다. registry count는 관찰용이며 제한값이 아니다.
