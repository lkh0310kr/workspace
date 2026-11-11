# Browser 구현 스펙

Electron webview guest, pane overlay viewport, renderer/main IPC로 구성한다. 브라우저 페이지는 iframe이 아니다. [수명·포커스](./lifecycle.md), [탐색·session·IPC](./navigation.md)를 함께 구현한다. 공통 shell 조정은 [InteractionCoordinator](../../../../docs/architecture/04-interaction-coordinator.md)를 따른다.

## 모듈과 상태 소유권

경로는 `apps/workspace-app/src` 기준이다.

| 모듈 | 소유 상태/책임 |
|---|---|
| renderer/src/panes/BrowserContent.tsx | 주소 입력, URL/loading/error/rendererGone, webContentsId, pending navigation, listener 연결 |
| renderer/src/panes/BrowserPaneOverlaySlot.tsx | paneNodeId→overlay slot root 등록 |
| renderer/src/browser/browserPageViewport.ts | item ID→shell/chromeInset/container, slot root listeners, chrome 높이 |
| renderer/src/browser/ensureBrowserPageWebview.ts | guest 생성 또는 기존 guest 재부착 |
| renderer/src/layout/browserWebviewRegistry.ts | item ID→persistent guest, renderer recovery flag, drag passthrough |
| renderer/src/layout/activeBrowserWebview.ts | 현재 활성 guest와 webContentsId 조회 |
| renderer/src/interaction/InteractionCoordinator.ts | workspace·pane·chip·overlay에 따른 표시/입력/focus 조정 |
| main/browserSession.ts | persist:browser session, 권한, UA와 WebAuthn 초기화 |
| main/browserNav.ts, preload/browserApi.ts | history/focus 명령, guest/new-tab/download 이벤트 계약 |

## Identity와 host 계약

workspaceTabId는 workspace, paneNodeId는 layout group, item.id는 browser 탭 identity다. webContentsId는 Electron이 발급하는 guest 핸들이며 재생성 때 바뀔 수 있다. 이들을 서로 교체해서 key로 쓰지 않는다.

BrowserContent는 item(url/title/favicon/zoomFactor), workspace tabId, paneNodeId, paneVisible/chipActive와 onUpdate/onOpenNewTab/onFocusPaneGroup/onSelectPaneTab을 받는다. URL/title/favicon/zoom 변경은 onUpdate로 layout item에 반영한다. guest 생명주기를 React component mount와 동일시하지 않는다.

## 재구현 순서

1. URL 정규화와 main session 초기화, preload API.
2. overlay slot·viewport와 item ID별 guest registry.
3. ensure/recovery·event listener·navigation actions.
4. InteractionCoordinator 등록, 표시·pointer·focus 전이.
5. address suggestions/history, download bar, zoom, 복구 UI.
6. 테스트와 실제 Electron에서 pane 이동/탭 전환/주소 입력/terminal 전환 검증.

브라우저 guest 보존에 대한 메모리 예산이나 LRU eviction 정책은 현재 구현돼 있지 않다. registry count는 관찰용이며 제한값이 아니다.
