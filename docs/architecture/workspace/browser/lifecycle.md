# Guest 수명, viewport, 포커스

근거는 [BrowserContent](../../../../apps/workspace-app/src/renderer/src/panes/BrowserContent.tsx), [viewport](../../../../apps/workspace-app/src/renderer/src/browser/browserPageViewport.ts), [registry](../../../../apps/workspace-app/src/renderer/src/layout/browserWebviewRegistry.ts), [ensure](../../../../apps/workspace-app/src/renderer/src/browser/ensureBrowserPageWebview.ts)다.

## DOM과 부착

BrowserPaneOverlaySlot 안에는 slot root와 BrowserContent chrome이 형제로 존재한다. item별 viewport는 `shell > chromeInset + container > webview`다. chromeInset은 toolbar 높이를 반영한다. paneNodeId로 등록된 root가 없고 기존 connected shell도 없으면 viewport를 만들지 않는다. 기존 shell이 올바른 root에 있으면 재사용하고 root가 바뀌면 shell을 교체한다.

ensure는 claimParkedBrowserWebview(item.id,container) 또는 persistent registry 조회를 먼저 수행한다. 기존 connected guest는 새 container로 이동시킨다. disconnected guest를 교체해야 하는 경로에서는 destroy 후 새로 생성한다. 새 guest 설정은 다음과 같다.

| 설정              | 값                                                                       |
| ----------------- | ------------------------------------------------------------------------ |
| partition         | persist:browser                                                          |
| src               | normalize(initialUrl,false), 실패 시 about:blank                         |
| allowpopups       | 빈 attribute                                                             |
| webpreferences    | contextIsolation=yes,webgl=yes                                           |
| dataset.tabItemId | item.id                                                                  |
| 스타일            | display:flex, flex:1, width/height:100%, border:none, background:#ffffff |
| zoom              | initialZoom 적용 시도; guest 미준비 예외는 무시                          |

## 연결과 해제 순서

attach effect는 tabId/item.id/paneNodeId/slotViewport/attachNonce/syncNavState에 반응한다. viewport→guest 확보→layout 적용→event 등록→active registry와 coordinator 등록→new-tab IPC 구독 순서다.

cleanup은 dom-ready/pending navigation을 reset하고 모든 guest/container listeners를 해제한다. 활성 guest라면 active handle을 지우고 coordinator.detachBrowserWebview, 활성 registry 해제, IPC 구독 해제, **parkBrowserPageViewport**를 수행한다. 이 경로는 shell을 숨기며 guest DOM을 registry에서 즉시 삭제하지 않는다. 실제 browser 탭 제거는 layoutActions의 destroyBrowserWebview를 통해 DOM·viewport·persistent registry를 정리한다.

registry에는 별도 parkBrowserWebview helper도 있다. hidden park host로 guest를 옮기고 400ms 뒤 미회수 guest를 destroy한다. claim은 timer를 취소한다. **BrowserContent cleanup이 이 helper를 호출한다고 구현하지 않는다.** viewport parking과 guest timer parking은 다른 경로다.

## 표시 상태표

| viewport 입력                | shell                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| paintable=false              | display:none, inert=true, aria-hidden=true                                             |
| paintable=true, active=false | display:flex, opacity:0, pointer-events:none, z-index:0, inert=true, aria-hidden=true  |
| paintable=true, active=true  | display:flex, opacity:1, pointer-events:auto, z-index:1, inert=false, aria-hidden 제거 |

BrowserPaneOverlaySlot 자체도 paneVisible=false면 display:none이다. 예전 문서의 ‘모든 ancestor에서 display:none 금지’를 현재 불변식으로 적용하지 않는다. viewport/coordinator/drag surface가 각각 맡은 DOM 계층에서 표시를 조정한다.

chipShown이면 guest input lock 해제, active guest 설정, terminal focus 해제, coordinator에 `chip-shown` focus 요청을 보낸다. 숨기면 address input blur, guest pointer-events:none, guest가 focus를 소유할 때 renderer로 반환, active guest 해제다. guest focus 이벤트는 owning group도 focus한다. chrome pointer 입력과 guest pointer 입력은 구분하고 주소 입력 focus 중 viewport pointer 처리에서 focus를 빼앗지 않는다.

DOM-ready, chip-shown, navigate, address-bar-dismiss 같은 명시 이벤트는 coordinator에 guest focus를 요청한다. 모든 요청이 즉시 native focus를 허용한다는 의미는 아니다. overlay barrier와 현재 workspace·pane·chip 상태가 최종 결정을 한다. [guest focus helper](../../../../apps/workspace-app/src/renderer/src/browser/browserGuestFocus.ts)와 [activation hook](../../../../apps/workspace-app/src/renderer/src/browser/useBrowserGuestActivationFocus.ts)의 정책을 함께 적용한다.

activation hook은 활성화당 한 번 focus 성공을 기록한다. 비활성 전환 또는 guest 준비 false→true에서 기록을 초기화한다. drag passthrough나 주소창 focus 유지 중에는 시도하지 않는다. requestAnimationFrame에서 guest 존재와 coordinator interactive를 확인하며 최대 24회 시도한다. guest native focus 또는 host webview focus를 확인하면 완료하고 effect cleanup에서 예약 frame을 취소한다.

## Drag와 recovery

첫 persistent guest 등록 때 window capture dragstart/dragend/drop listener를 붙이고 registry가 비면 제거한다. passthrough 진입에서 각 guest의 기존 pointerEvents를 저장하고 none으로 만든다. release 시 이전 값을 복원한다. drag 중 생성된 guest에도 현재 passthrough를 적용한다. 여러 소유자의 drag lock은 acquire/release로 조정한다.

render-process-gone은 item recovery-pending flag를 켜고 dom-ready는 끈다. destroyed 이벤트는 element가 여전히 connected일 때만 비정상 종료로 본다. toolbar action은 ref가 stale이면 registry의 connected guest를 확인하고 현재 viewport container 소속인지 검사한다. guest missing/disconnected/wrong-parent는 attach 필요 조건이다. recovery UI의 reload와 일반 toolbar reload 모두 준비 전 예외가 UI를 깨지 않도록 action helper를 사용한다.

## 검증 시나리오

| ID        | 행동                             | 결과                                                           |
| --------- | -------------------------------- | -------------------------------------------------------------- |
| B-LIFE-01 | 같은 item을 다른 pane으로 이동   | connected guest 재사용, 새 container와 coordinator pane 갱신   |
| B-LIFE-02 | React cleanup 후 즉시 remount    | persistent guest 재사용; mount마다 강제 새 guest 생성하지 않음 |
| B-LIFE-03 | browser 탭 삭제                  | guest·viewport·listeners·recovery flag 정리                    |
| B-LIFE-04 | drag 중 새 guest 생성, drag 종료 | pointer lock 적용 후 이전 스타일 복원                          |
| B-LIFE-05 | 주소 입력→terminal 클릭          | guest가 keyboard focus를 되가져가지 않음                       |
| B-LIFE-06 | viewport shell 재생성, ref stale | attach 감지, toolbar는 현재 connected guest 사용               |
| B-LIFE-07 | renderer gone→dom-ready          | recovery-pending true→false                                    |

registry/park/viewport/recovery/action/focus/activation 관련 기존 test가 순수 규칙을 검증한다. macOS native focus와 실제 Chromium guest compositing은 Electron 실행으로 별도 확인한다.
