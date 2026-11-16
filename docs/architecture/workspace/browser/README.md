# Browser 구현 스펙

Electron webview guest, pane overlay viewport, renderer/main IPC로 구성한다. 브라우저 페이지는 iframe이 아니다. [수명·포커스](./lifecycle.md), [탐색·session·IPC](./navigation.md)를 함께 구현한다. 공통 shell 조정은 [InteractionCoordinator](../../../../docs/architecture/04-interaction-coordinator.md)를 따른다.

## 모듈과 상태 소유권

경로는 `packages/browser/src` 및 `apps/desktop/src` 기준이다.

| 모듈                                                                                                                                                            | 소유 상태/책임                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| packages/browser/src/address-bar/                                                                                                                                | URL 입력, 방문 기록 제안, 주소창 focus/dismiss host port                                                 |
| packages/browser/src/navigation/                                                                                                                                  | URL 정규화, pane URL 정책, nav history UI, reload·zoom action과 navigation state                            |
| packages/browser/src/pane/                                                                                                                                       | Browser pane 구성·host 계약·guest port·viewport·수명 복구·focus·표시 정책과 pane CSS                   |
| packages/browser/src/downloads/                                                                                                                                  | Browser 다운로드 UI·상태 store·스타일; IPC 이벤트 수신은 Desktop relay가 연결                           |
| packages/browser/src/browserSessionPartition.ts                                                                                                                 | Main과 renderer가 공유하는 Browser persistent session partition 정책                                     |
| renderer/src/adapters/browser/runtime/browserPaneHost.ts                                                                                                        | `Electron.WebviewTag`를 BrowserWebviewPort로 변환하고 Desktop registry·IPC/focus 기능을 주입하는 adapter |
| renderer/src/adapters/browser/runtime/browserInteractionController.ts                                                                                           | Browser guest 등록, shell state 구독, 표시 정책과 native focus lifecycle                                 |
| renderer/src/adapters/browser/runtime/browserInteractionDiagnostics.ts                                                                                          | Browser guest DOM 진단 수집                                                                              |
| renderer/src/adapters/browser/runtime/browserIpc.ts                                                                                                             | Browser guest 이벤트와 Browser 단축키를 preload IPC에 연결하는 Desktop adapter                           |
| renderer/src/adapters/platform/nativeShell.ts                                                                                                                  | Browser 다운로드와 Editor 파일 트리에서 공유하는 OS 파일 관리자 reveal 동작                              |
| packages/browser/src/pane/, renderer/src/adapters/browser/paneKind.tsx                                                                                           | Browser overlay slot·pane 구성과 Desktop registry 조립                                                  |
| renderer/src/adapters/browser/runtime/ensureBrowserPageWebview.ts                                                                                               | guest 생성 또는 기존 guest 재부착                                                                        |
| renderer/src/adapters/browser/runtime/browserWebviewRegistry.ts                                                                                                 | item ID→persistent guest, renderer recovery flag, drag passthrough                                       |
| renderer/src/adapters/browser/runtime/activeBrowserWebview.ts                                                                                                   | 현재 활성 guest와 webContentsId 조회                                                                     |
| renderer/src/adapters/browser/runtime/browserGuestFocus.ts, browserFocusDebugLog.ts, focusPaneGroupForBrowser.ts                                                | guest/native focus 연결, Browser 진단, 소유 pane focus                                                   |
| renderer/src/interaction/portals/InteractionCoordinator.ts                                                                                                              | overlay·portal·active workspace 상태와 feature 변경 알림                                                 |
| main/browserSession.ts                                                                                                                                          | persist:browser session, 권한, UA와 WebAuthn 초기화                                                      |
| main/browserNav.ts, preload/browserApi.ts                                                                                                                       | history/focus 명령, guest/new-tab/download 이벤트 계약                                                   |

## 식별자와 host 계약

workspaceTabId는 workspace, paneNodeId는 layout group, item.id는 browser 탭 identity다. webContentsId는 Electron이 발급하는 guest 핸들이며 재생성 때 바뀔 수 있다. 이들을 서로 교체해서 key로 쓰지 않는다.

BrowserContent는 좁은 BrowserPaneItem(url/title/favicon/zoomFactor), workspace tabId, paneNodeId, paneVisible/chipActive와 host capability 및 navigation/focus callbacks를 받는다. URL/title/favicon/zoom 변경은 onUpdate로 layout item에 반영한다. guest 생명주기를 React component mount와 동일시하지 않는다.

PaneGroup은 `PaneKindDefinition.renderOverlay`로 overlay kind를 배치한다. Browser slot, view와 pane-kind factory는 Browser package가 제공하며, Desktop의 pane-kind adapter는 typed descriptor를 중앙 registry에 등록한다. `BrowserAddressBar`와 `BrowserContent`는 package의 host capability를 사용한다. Desktop Browser feature가 Electron guest lifecycle·persistent registry·native focus·IPC adapter를 제공하고 app-shell InteractionCoordinator는 overlay/portal/workspace snapshot을 제공한다. Browser host의 `closeTabItem`은 중앙 registry가 Browser item 제거를 수락한 뒤만 guest를 해제한다. 다운로드 store와 guest 표시 정책은 Browser package가 소유하며 Desktop relay가 preload 이벤트를 전달한다. tab 선택과 workspace visibility는 표시·입력 신호이며 webview 제거 조건이 아니다.

## 재구현 순서

1. URL 정규화와 main session 초기화, preload API.
2. overlay slot·viewport와 item ID별 guest registry.
3. ensure/recovery·event listener·navigation actions.
4. BrowserInteractionController 등록, 표시·pointer·focus 전이.
5. address suggestions/history, download bar, zoom, 복구 UI.
6. 테스트와 실제 Electron에서 pane 이동/탭 전환/주소 입력/terminal 전환 검증.

브라우저 guest 보존에 대한 메모리 예산이나 LRU eviction 정책은 현재 구현돼 있지 않다. registry count는 관찰용이며 제한값이 아니다.
